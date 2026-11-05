import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createBuiltinModel } from "./builtinModels";

const gltfLoader = new GLTFLoader();
const cache = new Map();

function cloneSkinnedSafe(root) {
  return root.clone(true);
}

/** 给 GLB 场景里按 name / userData.partId 打标 */
export function tagPartNodes(root, fallbackPartId = null) {
  root.traverse((obj) => {
    if (!obj.name && !obj.userData?.partId) return;
    const id = obj.userData?.partId || obj.name;
    if (!id || id === "Scene" || id === "RootNode") return;
    obj.userData.partId = id;
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  if (fallbackPartId && !findPartNode(root, fallbackPartId)) {
    root.userData.partId = fallbackPartId;
    root.name = fallbackPartId;
    root.traverse((c) => {
      if (c.isMesh) c.userData.partId = fallbackPartId;
    });
  }
  return root;
}

export function findPartNode(root, partId) {
  if (!root || !partId) return null;
  if (root.userData?.partId === partId || root.name === partId) return root;
  let hit = null;
  root.traverse((obj) => {
    if (hit) return;
    if (obj.userData?.partId === partId || obj.name === partId) hit = obj;
  });
  return hit;
}

export function listPartIds(root) {
  const ids = new Set();
  root?.traverse((obj) => {
    const id = obj.userData?.partId || (obj.name && obj.children?.length ? obj.name : null);
    if (id && id !== "Scene" && id !== "RootNode") ids.add(id);
  });
  return [...ids];
}

async function loadGltfUrl(url) {
  if (cache.has(url)) {
    return cloneSkinnedSafe(cache.get(url));
  }
  const gltf = await gltfLoader.loadAsync(url);
  const scene = gltf.scene || gltf.scenes?.[0];
  if (!scene) throw new Error("GLB 无场景根节点");
  tagPartNodes(scene);
  cache.set(url, scene);
  return cloneSkinnedSafe(scene);
}

/**
 * @param {{ kind?: string, id?: string, url?: string }} model
 * @param {{ partId?: string }} [opts]
 */
export async function resolveModel(model, opts = {}) {
  if (!model) return null;
  const kind = model.kind || (model.url ? "glb" : "builtin");
  if (kind === "glb" || kind === "gltf") {
    if (!model.url) throw new Error("缺少 GLB 地址");
    const root = await loadGltfUrl(model.url);
    tagPartNodes(root, opts.partId || null);
    root.userData.modelSource = { kind: "glb", url: model.url };
    return root;
  }
  const id = model.id || "street_light";
  const root = createBuiltinModel(id);
  if (!root) throw new Error(`未知内置模型: ${id}`);
  tagPartNodes(root, opts.partId || null);
  root.userData.modelSource = { kind: "builtin", id };
  return root;
}

export function clearModelCache() {
  cache.clear();
}

/** 归一化包围盒：使模型落在目标尺寸附近，底面贴 y=0 */
export function normalizeModelSize(root, targetSize = 1.2) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetSize / maxDim;
  root.scale.multiplyScalar(s);
  const box2 = new THREE.Box3().setFromObject(root);
  const center = box2.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box2.min.y;
  return root;
}
