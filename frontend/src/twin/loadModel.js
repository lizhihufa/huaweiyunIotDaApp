import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createBuiltinModel } from "./builtinModels";

const gltfLoader = new GLTFLoader();
const cache = new Map();

/** 深拷贝：几何/材质独立，避免 ghost dispose 或场景重建拖垮缓存 */
export function deepCloneModel(root) {
  if (!root) return null;
  const clone = root.clone(true);
  clone.traverse((c) => {
    if (!c.isMesh) return;
    if (c.geometry) c.geometry = c.geometry.clone();
    if (c.material) {
      c.material = Array.isArray(c.material)
        ? c.material.map((m) => (m?.clone ? m.clone() : m))
        : c.material.clone
          ? c.material.clone()
          : c.material;
    }
  });
  return clone;
}

function cloneSkinnedSafe(root) {
  return deepCloneModel(root);
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
  scene.traverse((c) => {
    if (!c.isMesh) return;
    c.castShadow = true;
    c.receiveShadow = true;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      m.needsUpdate = true;
    }
  });
  tagPartNodes(scene);
  cache.set(url, scene);
  return cloneSkinnedSafe(scene);
}

/**
 * 缩放并包一层 Group，使枢轴在底面中心；之后可直接 position.set(x,y,z)。
 * @param {THREE.Object3D} object
 * @param {number} targetSize 最长边目标尺寸（米）
 */
export function normalizeModelSize(object, targetSize = 1.2) {
  const fit = Math.max(0.05, Number(targetSize) || 1.2);
  const wrap = new THREE.Group();
  wrap.name = object.name || "glb_fit";
  wrap.add(object);

  const box0 = new THREE.Box3().setFromObject(wrap);
  const size0 = box0.getSize(new THREE.Vector3());
  const maxDim = Math.max(size0.x, size0.y, size0.z) || 1;
  const s = fit / maxDim;
  wrap.scale.setScalar(s);
  wrap.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  // 偏移在未缩放的子节点局部空间中扣除
  object.position.x -= center.x / s;
  object.position.y -= box.min.y / s;
  object.position.z -= center.z / s;
  wrap.userData.fitSize = fit;
  return wrap;
}

/**
 * @param {{ kind?: string, id?: string, url?: string, fit?: number }} model
 * @param {{ partId?: string, fit?: number, skipFit?: boolean }} [opts]
 */
export async function resolveModel(model, opts = {}) {
  if (!model) return null;
  const kind = model.kind || (model.url ? "glb" : "builtin");
  if (kind === "glb" || kind === "gltf") {
    if (!model.url) throw new Error("缺少 GLB 地址");
    let root = await loadGltfUrl(model.url);
    tagPartNodes(root, opts.partId || null);
    const fit = opts.fit ?? model.fit;
    if (fit && !opts.skipFit) {
      root = normalizeModelSize(root, fit);
    }
    root.userData.modelSource = { kind: "glb", url: model.url, fit: fit || null };
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
