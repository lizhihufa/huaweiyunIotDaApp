import * as THREE from "three";
import { buildEnvironment } from "./buildEnvironments";
import { createBuiltinModel } from "./builtinModels";
import { findPartNode, normalizeModelSize } from "./loadModel";
import { resolveEnvId } from "./sceneTypes";

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.15,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    ...opts.extra,
  });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, segs = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function markPart(obj, id, label) {
  obj.userData.partId = id;
  obj.userData.label = label;
  obj.traverse((c) => {
    if (c.isMesh) {
      c.userData.partId = id;
      c.userData.label = label;
    }
  });
  return obj;
}

const PART_LABELS = {
  pole: "灯杆",
  lamp: "路灯灯头",
  base: "底座 / 场景",
  mcu: "STM32 主控",
  relay: "继电器",
  wifi: "Wi-Fi 模块",
  ldr: "光敏电阻",
};

function texturedMaterial(canvas, fallbackColor) {
  if (!canvas) return mat(fallbackColor);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.12,
  });
}

/** 释放几何与材质；不 dispose 贴图（GLB 缓存与实例常共享 map） */
function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        // 仅释放材质本身，避免弄坏 GLTFLoader 缓存里的共享贴图
        m?.dispose?.();
      });
    }
  });
}

/**
 * 可切换场景环境的孪生世界。
 * @param {string} [initialSceneType]
 */
export function createTwinWorld(initialSceneType = "street", initialConfig = {}) {
  const root = new THREE.Group();
  const parts = {};
  let sceneType = initialSceneType || "street";
  let sceneConfig = { ...(initialConfig || {}) };
  let envGroup = buildEnvironment(sceneType, sceneConfig);
  root.add(envGroup);

  let assembly = new THREE.Group();
  assembly.name = "assembly";
  root.add(assembly);

  let glassMat = null;
  let relayMesh = null;
  const lampLight = new THREE.PointLight(0xffe2a0, 0, 18, 2);
  lampLight.castShadow = true;
  root.add(lampLight);

  function clearAssembly() {
    disposeObject3D(assembly);
    root.remove(assembly);
    assembly = new THREE.Group();
    assembly.name = "assembly";
    root.add(assembly);
    Object.keys(parts).forEach((k) => delete parts[k]);
    glassMat = null;
    relayMesh = null;
  }

  function setEnvironment(type, config = {}) {
    sceneType = type || "street";
    sceneConfig = { ...(config || {}) };
    if (envGroup) {
      root.remove(envGroup);
      disposeObject3D(envGroup);
    }
    envGroup = buildEnvironment(sceneType, sceneConfig);
    root.add(envGroup);
  }

  function buildDefaultAssembly() {
    clearAssembly();
    const env = resolveEnvId(sceneType);
    if (env === "blank") {
      // 空地：无默认装配，只靠放置板建造
      lampLight.position.set(0, 6, 0);
      return;
    }
    if (env === "room") {
      buildRoomDefaults();
    } else if (env === "greenhouse") {
      buildGreenhouseDefaults();
    } else if (env === "farm") {
      buildFarmDefaults();
    } else if (env === "rice_paddy") {
      buildRiceDefaults();
    } else {
      buildStreetDefaults();
    }
  }

  function bindPartsFromRoot(modelRoot) {
    Object.keys(parts).forEach((k) => delete parts[k]);
    glassMat = null;
    relayMesh = null;
    modelRoot.traverse((obj) => {
      const id = obj.userData?.partId;
      if (!id) return;
      // 优先保留带 children 的部件根（Group）
      if (!parts[id] || (obj.children && obj.children.length && !parts[id].children?.length)) {
        parts[id] = obj;
      }
      if (obj.userData?.lampGlassMat) glassMat = obj.userData.lampGlassMat;
      if (obj.material?.userData?.lampGlass) glassMat = obj.material;
      if (id === "relay" && (obj.isMesh || obj.children?.length)) relayMesh = obj;
    });
    if (parts.lamp) {
      const p = new THREE.Vector3();
      parts.lamp.getWorldPosition(p);
      lampLight.position.copy(p);
      lampLight.position.y -= 0.35;
    }
  }

  function buildStreetDefaults() {
    const model = createBuiltinModel("street_light");
    assembly.add(model);
    bindPartsFromRoot(model);
  }

  function buildRoomDefaults() {
    const deskDev = box(1.6, 0.12, 1.0, mat(0x1b4332), 0, 1.72, 1.5);
    markPart(deskDev, "mcu", "主控板");
    parts.mcu = deskDev;
    assembly.add(deskDev);
    const sensor = cyl(0.18, 0.18, 0.35, mat(0xfef3c7), 1.1, 1.85, 1.5, 12);
    markPart(sensor, "sensor_temp", "温湿度传感器");
    parts.sensor_temp = sensor;
    assembly.add(sensor);
    glassMat = mat(0xfff4c2, {
      roughness: 0.25,
      emissive: 0xffd56a,
      emissiveIntensity: 0,
      extra: { transparent: true, opacity: 0.9 },
    });
    const lamp = new THREE.Group();
    lamp.add(box(0.8, 0.12, 0.8, mat(0x334155), 0, 0, 0));
    lamp.add(box(0.7, 0.08, 0.7, glassMat, 0, -0.1, 0));
    lamp.position.set(0, 5.2, 0);
    markPart(lamp, "lamp", "室内灯");
    parts.lamp = lamp;
    assembly.add(lamp);
    lampLight.position.set(0, 5.0, 0);
    relayMesh = box(0.5, 0.35, 0.4, mat(0x475569), 1.8, 1.85, 2.0);
    markPart(relayMesh, "relay", "智能插座 / 继电器");
    parts.relay = relayMesh;
    assembly.add(relayMesh);
  }

  function buildGreenhouseDefaults() {
    const gate = box(1.2, 0.9, 0.6, mat(0x0ea5e9), -6, 0.7, 0);
    markPart(gate, "valve", "电磁阀 / 灌溉");
    parts.valve = gate;
    assembly.add(gate);
    const sensor = cyl(0.12, 0.12, 1.2, mat(0x94a3b8), 2, 0.9, 0, 10);
    markPart(sensor, "soil_sensor", "土壤湿度探头");
    parts.soil_sensor = sensor;
    assembly.add(sensor);
    const boxGw = box(1.4, 0.7, 0.9, mat(0x1e293b), 6, 0.55, -5);
    markPart(boxGw, "mcu", "田间网关");
    parts.mcu = boxGw;
    assembly.add(boxGw);
    lampLight.position.set(0, 3.5, 0);
  }

  function buildFarmDefaults() {
    const weather = box(0.9, 1.4, 0.9, mat(0xf8fafc), 0, 1.0, -8);
    markPart(weather, "weather", "气象站");
    parts.weather = weather;
    assembly.add(weather);
    const stake = cyl(0.1, 0.1, 1.3, mat(0x64748b), -5, 0.85, 0, 8);
    markPart(stake, "soil_sensor", "土壤传感器");
    parts.soil_sensor = stake;
    assembly.add(stake);
    const gw = box(1.6, 1.0, 1.0, mat(0x1e293b), 5, 0.7, 8);
    markPart(gw, "gateway", "网关箱");
    parts.gateway = gw;
    assembly.add(gw);
    lampLight.position.set(0, 4, 0);
  }

  function buildRiceDefaults() {
    const water = cyl(0.12, 0.12, 1.5, mat(0x38bdf8), -4, 1.0, -3, 10);
    markPart(water, "water_sensor", "水位传感器");
    parts.water_sensor = water;
    assembly.add(water);
    const gate = box(1.8, 1.0, 0.4, mat(0x78716c), 10, 0.7, 0);
    markPart(gate, "gate", "进排水闸");
    parts.gate = gate;
    assembly.add(gate);
    const gw = box(1.3, 0.8, 0.9, mat(0x1e293b), 0, 0.9, -8.5);
    markPart(gw, "gateway", "田间网关");
    parts.gateway = gw;
    assembly.add(gw);
    lampLight.position.set(0, 3, 0);
  }

  /**
   * 标注只驱动 transform。优先使用预加载的装配模型（GLB / 内置 street_light），
   * 按 partId 找节点改 position/scale；无模型时才回退到简易几何。
   */
  function applyAssembly(layout, textureCanvases = {}, meta = {}) {
    const modelRoot = meta.modelRoot || null;
    const labels = { ...PART_LABELS, ...(meta.labels || {}) };
    const shapes = { ...(meta.shapes || {}) };
    const partModels = meta.partModels || {};

    if (!layout || !Object.keys(layout).length) {
      if (modelRoot) {
        clearAssembly();
        assembly.add(modelRoot);
        bindPartsFromRoot(modelRoot);
        setLampOn(false);
        return;
      }
      buildDefaultAssembly();
      setLampOn(false);
      return;
    }

    clearAssembly();

    if (modelRoot) {
      assembly.add(modelRoot);
      bindPartsFromRoot(modelRoot);
      for (const [partId, conf] of Object.entries(layout)) {
        const node = parts[partId] || findPartNode(modelRoot, partId);
        if (!node) continue;
        const [px, py, pz] = conf.position;
        const [sx, sy, sz] = conf.scale;
        // 标注只改 transform：先复位 scale，量默认尺寸，再按标注框缩放
        node.scale.set(1, 1, 1);
        node.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
        node.position.set(px, py, pz);
        node.scale.set(
          Math.max(0.12, sx / Math.max(0.05, size.x)),
          Math.max(0.12, sy / Math.max(0.05, size.y)),
          Math.max(0.12, sz / Math.max(0.05, size.z))
        );
        parts[partId] = node;
      }
      if (parts.lamp) {
        const p = new THREE.Vector3();
        parts.lamp.getWorldPosition(p);
        lampLight.position.copy(p);
        lampLight.position.y -= 0.35;
      }
      setLampOn(false);
      return;
    }

    // 无整机模型：按部件各自模型或简易几何
    const palette = [0x94a3b8, 0x64748b, 0x0ea5e9, 0x14b8a6, 0xf59e0b, 0xa78bfa, 0xf472b6];
    const colors = {
      pole: 0x6b7280,
      lamp: 0x1f2933,
      base: 0x2f6b4f,
      mcu: 0x1b4332,
      relay: 0x334155,
      wifi: 0x0f172a,
      ldr: 0xfef3c7,
    };

    let colorIdx = 0;
    for (const [partId, conf] of Object.entries(layout)) {
      const [px, py, pz] = conf.position;
      const [sx, sy, sz] = conf.scale;
      let obj = partModels[partId] || null;

      if (obj) {
        obj = normalizeModelSize(obj, Math.max(sx, sy, sz));
        obj.position.set(px, py, pz);
        markPart(obj, partId, labels[partId] || partId);
      } else {
        const canvas = textureCanvases[partId];
        const fallback = colors[partId] || palette[colorIdx++ % palette.length];
        const material = texturedMaterial(canvas, fallback);
        const shape =
          shapes[partId] ||
          (partId === "pole" || partId === "ridge" || partId === "rice"
            ? "pole"
            : partId === "lamp"
              ? "lamp"
              : partId.includes("sensor") || partId === "ldr"
                ? "sensor"
                : "box");

        if (shape === "pole") {
          const r = Math.max(0.08, Math.min(sx, sz) / 2);
          obj = cyl(r, r * 1.15, sy, material, 0, 0, 0);
          obj.position.set(px, Math.max(sy / 2, py), pz);
        } else if (shape === "sensor") {
          const r = Math.max(0.08, Math.min(sx, sz, sy) / 2);
          obj = cyl(r, r, Math.max(0.15, sy), material, 0, 0, 0);
          obj.position.set(px, py, pz);
        } else if (shape === "lamp") {
          const group = new THREE.Group();
          const housing = box(sx, sy, sz, material, 0, 0, 0);
          glassMat = mat(0xfff4c2, {
            roughness: 0.25,
            metalness: 0.05,
            emissive: 0xffd56a,
            emissiveIntensity: 0,
            extra: { transparent: true, opacity: 0.92 },
          });
          const glass = box(
            sx * 0.85,
            Math.max(0.08, sy * 0.35),
            sz * 0.8,
            glassMat,
            0,
            -sy * 0.45,
            0
          );
          group.add(housing, glass);
          group.position.set(px, py, pz);
          obj = group;
          lampLight.position.set(px, py - sy * 0.5, pz);
        } else {
          obj = box(sx, sy, sz, material, 0, 0, 0);
          obj.position.set(px, py, pz);
          if (partId === "relay" || partId === "valve" || partId === "gate") relayMesh = obj;
        }
        markPart(obj, partId, labels[partId] || partId);
      }

      parts[partId] = obj;
      assembly.add(obj);
    }

    setLampOn(false);
  }

  /** 在环境上摆放场景素材（草/树/木/植物/作物） */
  function applySceneProps(propRoots = []) {
    let propsGroup = root.getObjectByName("sceneProps");
    if (propsGroup) {
      root.remove(propsGroup);
      disposeObject3D(propsGroup);
    }
    propsGroup = new THREE.Group();
    propsGroup.name = "sceneProps";
    for (const item of propRoots) {
      if (item?.root) propsGroup.add(item.root);
      if (item?.instanced) propsGroup.add(item.instanced);
    }
    root.add(propsGroup);
  }

  const highlightMats = [];
  function setHighlight(partId) {
    for (const m of highlightMats) {
      m.emissiveIntensity = m.userData._baseEmissive || 0;
      if (m.userData._wasHighlight) {
        m.emissive.setHex(m.userData._baseEmissiveColor || 0x000000);
        m.userData._wasHighlight = false;
      }
    }
    highlightMats.length = 0;
    if (!partId || !parts[partId]) return;
    parts[partId].traverse((c) => {
      if (!c.isMesh || !c.material) return;
      const materials = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of materials) {
        if (!m.emissive) continue;
        m.userData._baseEmissive = m.emissiveIntensity || 0;
        m.userData._baseEmissiveColor = m.emissive.getHex();
        m.userData._wasHighlight = true;
        m.emissive.setHex(0x38bdf8);
        m.emissiveIntensity = Math.max(0.35, m.userData._baseEmissive);
        highlightMats.push(m);
      }
    });
  }

  function setLampOn(on) {
    if (!glassMat && parts.lamp) {
      parts.lamp.traverse((c) => {
        if (c.material?.userData?.lampGlass) glassMat = c.material;
        if (c.userData?.lampGlassMat) glassMat = c.userData.lampGlassMat;
      });
      if (parts.lamp.userData?.lampGlassMat) glassMat = parts.lamp.userData.lampGlassMat;
    }
    if (glassMat) {
      glassMat.emissiveIntensity = on ? 1.35 : 0;
      glassMat.color.setHex(on ? 0xfff1b8 : 0xd6d3c8);
    }
    lampLight.intensity = on ? 3.2 : 0;
    const relayTarget = relayMesh?.isMesh
      ? relayMesh
      : relayMesh
        ? findPartNode(relayMesh, "relay") || relayMesh
        : null;
    const relayMat = relayTarget?.isMesh ? relayTarget.material : null;
    if (relayMat?.emissive) {
      relayMat.emissive = new THREE.Color(on ? 0x22c55e : 0x000000);
      relayMat.emissiveIntensity = on ? 0.55 : 0;
    }
  }

  function dispose() {
    clearAssembly();
    if (envGroup) disposeObject3D(envGroup);
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose?.());
      }
    });
  }

  buildDefaultAssembly();
  setLampOn(false);

  return {
    root,
    parts,
    lampLight,
    getSceneType: () => sceneType,
    getSceneConfig: () => ({ ...sceneConfig }),
    setEnvironment,
    setLampOn,
    setHighlight,
    applyAssembly,
    applySceneProps,
    resetDefault: () => {
      buildDefaultAssembly();
      setLampOn(false);
    },
    dispose,
  };
}

/** @deprecated 兼容旧名 */
export function createStreetLightScene() {
  return createTwinWorld("street");
}

/** 把三视图贴到场景后方三块展板（可选） */
export function attachViewPlanes(root, views, loader) {
  const group = new THREE.Group();
  group.name = "viewPlanes";
  const specs = [
    { key: "front", x: -8.5, y: 3.2, z: -6.5, rotY: 0.15 },
    { key: "side", x: 0, y: 3.2, z: -7.2, rotY: 0 },
    { key: "top", x: 8.5, y: 3.2, z: -6.5, rotY: -0.15 },
  ];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.8 });

  for (const s of specs) {
    const url = views?.[s.key];
    if (!url) continue;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 0.12), frameMat);
    frame.position.set(s.x, s.y, s.z);
    frame.rotation.y = s.rotY;
    group.add(frame);

    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(4.0, 3.0),
          new THREE.MeshBasicMaterial({ map: tex })
        );
        panel.position.set(s.x, s.y, s.z + 0.08);
        panel.rotation.y = s.rotY;
        group.add(panel);
      },
      undefined,
      () => {}
    );
  }
  root.add(group);
  return group;
}
