/**
 * 内置模型（等价于命名节点的 GLB）：
 * - street_light：整机装配，子节点名 = partId
 * - dev_*：单部件设备模块
 * - scene_*：场景装饰素材
 */
import * as THREE from "three";

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.15,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
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

function cone(r, h, material, x = 0, y = 0, z = 0, segs = 12) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function markPart(obj, id, label) {
  obj.name = id;
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

/** 智能路灯整机：子 Group 名即 partId */
export function createStreetLightBuiltin() {
  const root = new THREE.Group();
  root.name = "street_light";
  root.userData.builtinId = "street_light";

  const pole = new THREE.Group();
  const poleMat = mat(0x6b7280, { metalness: 0.55, roughness: 0.32 });
  pole.add(cyl(0.2, 0.26, 7.2, poleMat, 0, 3.6, 0, 24));
  pole.add(box(2.5, 0.16, 0.16, poleMat, 1.05, 7.12, 0));
  pole.add(cyl(0.08, 0.08, 0.5, poleMat, 2.2, 7.12, 0, 12));
  pole.add(cyl(0.58, 0.72, 0.32, poleMat, 0, 0.18, 0, 20));
  pole.position.set(-3.2, 0, 1.2);
  markPart(pole, "pole", "灯杆");
  root.add(pole);

  const lamp = new THREE.Group();
  const housing = mat(0x1f2933, { metalness: 0.45, roughness: 0.4 });
  const glass = mat(0xfff4c2, {
    roughness: 0.22,
    metalness: 0.05,
    emissive: 0xffd56a,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.92,
  });
  glass.userData.lampGlass = true;
  lamp.add(box(1.55, 0.26, 0.95, housing, 0, 0, 0));
  lamp.add(box(1.25, 0.1, 0.72, glass, 0, -0.18, 0));
  lamp.add(cyl(0.06, 0.06, 0.35, housing, -0.85, 0.05, 0, 10));
  lamp.position.set(-1.0, 7.05, 1.2);
  markPart(lamp, "lamp", "路灯灯头");
  lamp.userData.lampGlassMat = glass;
  root.add(lamp);

  const base = new THREE.Group();
  base.add(box(3.6, 0.12, 2.4, mat(0x2f6b4f), 0, 0, 0));
  base.position.set(0, 0.55, -4.2);
  markPart(base, "base", "底座 / 主板");
  root.add(base);

  const mcu = createDevMcu();
  mcu.position.set(-0.7, 0.72, -4.2);
  root.add(mcu);

  const relay = createDevRelay();
  relay.position.set(0.55, 0.82, -4.35);
  root.add(relay);

  const wifi = createDevWifi();
  wifi.position.set(1.15, 0.7, -3.85);
  root.add(wifi);

  const ldr = createDevLdr();
  ldr.position.set(-1.35, 0.78, -3.55);
  root.add(ldr);

  root.userData.defaultPose = capturePose(root);
  return root;
}

function capturePose(root) {
  const pose = {};
  root.children.forEach((child) => {
    if (!child.userData?.partId) return;
    pose[child.userData.partId] = {
      position: child.position.toArray(),
      scale: child.scale.toArray(),
      rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
    };
  });
  return pose;
}

export function createDevMcu() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.12, 0.9, mat(0x1b4332), 0, 0, 0));
  g.add(box(0.35, 0.08, 0.35, mat(0x0f172a, { metalness: 0.4 }), -0.35, 0.1, 0.1));
  g.add(box(0.22, 0.06, 0.55, mat(0xfbbf24), 0.45, 0.08, 0));
  for (let i = 0; i < 6; i++) {
    g.add(box(0.06, 0.05, 0.06, mat(0xcbd5e1), -0.55 + i * 0.12, 0.09, -0.32));
  }
  markPart(g, "mcu", "STM32 主控");
  return g;
}

export function createDevRelay() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.28, 0.55, mat(0x334155, { metalness: 0.35 }), 0, 0, 0));
  g.add(box(0.35, 0.22, 0.35, mat(0x1e293b), 0.05, 0.18, 0));
  g.add(cyl(0.05, 0.05, 0.12, mat(0x22c55e), -0.2, 0.2, 0.12, 10));
  markPart(g, "relay", "继电器");
  return g;
}

export function createDevWifi() {
  const g = new THREE.Group();
  g.add(box(0.85, 0.1, 0.55, mat(0x0f172a), 0, 0, 0));
  g.add(cyl(0.035, 0.035, 0.55, mat(0xcbd5e1, { metalness: 0.65 }), 0.28, 0.35, 0, 10));
  markPart(g, "wifi", "Wi-Fi 模块");
  return g;
}

export function createDevLdr() {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.16, 0.18, mat(0xfef3c7), 0, 0, 0, 16));
  g.add(cyl(0.04, 0.04, 0.25, mat(0x78716c), 0, -0.2, 0, 8));
  markPart(g, "ldr", "光敏电阻");
  return g;
}

export function createDevLamp() {
  const g = new THREE.Group();
  const glass = mat(0xfff4c2, {
    roughness: 0.22,
    metalness: 0.05,
    emissive: 0xffd56a,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.92,
  });
  glass.userData.lampGlass = true;
  g.add(box(1.4, 0.24, 0.85, mat(0x1f2933, { metalness: 0.4 }), 0, 0, 0));
  g.add(box(1.15, 0.1, 0.65, glass, 0, -0.16, 0));
  g.userData.lampGlassMat = glass;
  markPart(g, "lamp", "路灯灯头");
  return g;
}

export function createDevEsp32() {
  const g = new THREE.Group();
  g.add(box(1.2, 0.1, 0.55, mat(0x111827), 0, 0, 0));
  g.add(box(0.45, 0.08, 0.35, mat(0x1e293b, { metalness: 0.4 }), -0.2, 0.09, 0));
  g.add(box(0.28, 0.06, 0.22, mat(0x64748b), 0.35, 0.08, 0.05));
  g.add(cyl(0.03, 0.03, 0.4, mat(0xcbd5e1, { metalness: 0.6 }), 0.48, 0.28, -0.1, 8));
  markPart(g, "mcu", "ESP32 DevKit");
  return g;
}

export function createDevEsp8266() {
  const g = new THREE.Group();
  g.add(box(1.1, 0.1, 0.5, mat(0x1e3a5f), 0, 0, 0));
  g.add(box(0.4, 0.07, 0.3, mat(0x0f172a), -0.15, 0.08, 0));
  g.add(box(0.2, 0.05, 0.18, mat(0x94a3b8), 0.35, 0.07, 0));
  markPart(g, "mcu", "ESP8266 NodeMCU");
  return g;
}

export function createDevArduino() {
  const g = new THREE.Group();
  g.add(box(1.5, 0.1, 0.75, mat(0x0ea5e9), 0, 0, 0));
  g.add(box(0.35, 0.08, 0.35, mat(0x0f172a), -0.35, 0.09, 0.05));
  g.add(box(0.55, 0.08, 0.2, mat(0x111827), 0.4, 0.09, -0.15));
  for (let i = 0; i < 8; i++) {
    g.add(box(0.05, 0.05, 0.05, mat(0xe2e8f0), -0.6 + i * 0.1, 0.08, 0.28));
  }
  markPart(g, "mcu", "Arduino Uno");
  return g;
}

export function createDevRpi() {
  const g = new THREE.Group();
  g.add(box(1.35, 0.1, 0.7, mat(0x166534), 0, 0, 0));
  g.add(box(0.4, 0.12, 0.4, mat(0x1e293b, { metalness: 0.35 }), -0.25, 0.1, 0));
  g.add(box(0.25, 0.08, 0.35, mat(0x64748b), 0.45, 0.08, 0.1));
  markPart(g, "gateway", "树莓派 Zero");
  return g;
}

export function createDevDht11() {
  const g = new THREE.Group();
  g.add(box(0.55, 0.08, 0.7, mat(0x1e293b), 0, 0, 0));
  g.add(box(0.35, 0.35, 0.2, mat(0x334155), 0, 0.22, 0.1));
  g.add(box(0.28, 0.28, 0.08, mat(0x94a3b8), 0, 0.22, 0.22));
  markPart(g, "sensor_temp", "DHT11 温湿度");
  return g;
}

export function createDevSoil() {
  const g = new THREE.Group();
  g.add(box(0.45, 0.08, 0.55, mat(0x14532d), 0, 0.35, 0));
  g.add(box(0.08, 0.7, 0.12, mat(0xcbd5e1, { metalness: 0.4 }), -0.08, 0, 0));
  g.add(box(0.08, 0.7, 0.12, mat(0xcbd5e1, { metalness: 0.4 }), 0.08, 0, 0));
  markPart(g, "soil_sensor", "土壤湿度探头");
  return g;
}

export function createDevUltrasonic() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.12, 0.45, mat(0x1e293b), 0, 0, 0));
  g.add(cyl(0.14, 0.14, 0.12, mat(0x64748b), -0.22, 0.12, 0, 16));
  g.add(cyl(0.14, 0.14, 0.12, mat(0x64748b), 0.22, 0.12, 0, 16));
  markPart(g, "ultrasonic", "HC-SR04 超声波");
  return g;
}

export function createDevMq2() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.1, 0.5, mat(0x1e293b), 0, 0, 0));
  g.add(cyl(0.16, 0.16, 0.35, mat(0xc4a574), 0, 0.25, 0, 12));
  g.add(cyl(0.17, 0.17, 0.05, mat(0x78716c), 0, 0.42, 0, 12));
  markPart(g, "gas_sensor", "MQ-2 气体传感器");
  return g;
}

export function createDevPir() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.12, 0.55, mat(0x0f172a), 0, 0, 0));
  g.add(cyl(0.2, 0.2, 0.18, mat(0xf8fafc, { roughness: 0.35 }), 0, 0.18, 0, 16));
  markPart(g, "pir", "PIR 人体红外");
  return g;
}

export function createDevWater() {
  const g = new THREE.Group();
  g.add(box(0.35, 0.08, 0.9, mat(0x1e3a5f), 0, 0.4, 0));
  g.add(box(0.12, 0.85, 0.08, mat(0x38bdf8, { metalness: 0.25 }), 0, 0, 0));
  markPart(g, "water_sensor", "水位传感器");
  return g;
}

export function createDevCamera() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.35, 0.45, mat(0x111827), 0, 0.2, 0));
  g.add(cyl(0.14, 0.14, 0.18, mat(0x334155, { metalness: 0.5 }), 0, 0.22, 0.2, 16));
  g.add(cyl(0.08, 0.08, 0.04, mat(0x0ea5e9), 0, 0.22, 0.3, 12));
  markPart(g, "camera", "摄像头模块");
  return g;
}

export function createDevServo() {
  const g = new THREE.Group();
  g.add(box(0.45, 0.4, 0.8, mat(0x1e293b), 0, 0.2, 0));
  g.add(cyl(0.1, 0.1, 0.15, mat(0x64748b), 0, 0.48, -0.15, 12));
  g.add(box(0.08, 0.08, 0.55, mat(0xf8fafc), 0, 0.55, 0.1));
  markPart(g, "servo", "SG90 舵机");
  return g;
}

export function createDevPump() {
  const g = new THREE.Group();
  g.add(cyl(0.28, 0.28, 0.55, mat(0x0ea5e9, { metalness: 0.35 }), 0, 0.28, 0, 16));
  g.add(cyl(0.08, 0.08, 0.35, mat(0x64748b), 0.3, 0.45, 0, 8));
  g.add(cyl(0.08, 0.08, 0.25, mat(0x64748b), -0.25, 0.15, 0.2, 8));
  markPart(g, "pump", "微型水泵");
  return g;
}

export function createDevValve() {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.12, 0.9, mat(0x64748b, { metalness: 0.5 }), 0, 0.2, 0, 12));
  g.rotation.z = Math.PI / 2;
  const body = box(0.45, 0.45, 0.4, mat(0x0ea5e9), 0, 0.35, 0);
  g.add(body);
  g.add(cyl(0.08, 0.08, 0.35, mat(0x1e293b), 0, 0.65, 0, 10));
  markPart(g, "valve", "电磁阀");
  return g;
}

export function createDevFan() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.15, 0.9, mat(0x334155), 0, 0.08, 0));
  g.add(cyl(0.35, 0.35, 0.12, mat(0x64748b), 0, 0.22, 0, 16));
  for (let i = 0; i < 4; i++) {
    const blade = box(0.55, 0.04, 0.12, mat(0xcbd5e1), 0, 0.28, 0);
    blade.rotation.y = (i * Math.PI) / 2;
    g.add(blade);
  }
  markPart(g, "fan", "散热风机");
  return g;
}

export function createDevLed() {
  const g = new THREE.Group();
  g.add(box(1.2, 0.06, 0.2, mat(0x111827), 0, 0, 0));
  for (let i = 0; i < 6; i++) {
    g.add(
      box(0.12, 0.05, 0.12, mat(0x22c55e, { emissive: 0x16a34a, emissiveIntensity: 0.4 }), -0.5 + i * 0.2, 0.06, 0)
    );
  }
  markPart(g, "led", "LED 灯带模块");
  return g;
}

export function createDevOled() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.08, 0.55, mat(0x1e293b), 0, 0, 0));
  g.add(box(0.55, 0.04, 0.35, mat(0x0f172a), 0, 0.06, 0));
  g.add(box(0.5, 0.02, 0.28, mat(0x38bdf8, { emissive: 0x0284c7, emissiveIntensity: 0.25 }), 0, 0.08, 0));
  markPart(g, "oled", "0.96 OLED 屏");
  return g;
}

export function createDevLora() {
  const g = new THREE.Group();
  g.add(box(0.85, 0.1, 0.5, mat(0x14532d), 0, 0, 0));
  g.add(box(0.3, 0.06, 0.25, mat(0x0f172a), -0.15, 0.08, 0));
  g.add(cyl(0.03, 0.03, 0.7, mat(0xcbd5e1, { metalness: 0.6 }), 0.3, 0.4, 0, 8));
  markPart(g, "lora", "LoRa 模块");
  return g;
}

function tagScene(g, name, kind) {
  g.name = name;
  g.userData.assetKind = kind;
  return g;
}

export function createSceneGrass() {
  const g = new THREE.Group();
  g.add(box(2.4, 0.08, 2.4, mat(0x4d7c0f, { roughness: 0.9 }), 0, 0.04, 0));
  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 2;
    const z = (Math.random() - 0.5) * 2;
    g.add(cone(0.05, 0.25 + Math.random() * 0.2, mat(0x65a30d), x, 0.2, z, 5));
  }
  return tagScene(g, "scene_grass", "grass");
}

export function createSceneGrassTall() {
  const g = new THREE.Group();
  g.add(box(1.8, 0.06, 1.8, mat(0x3f6212, { roughness: 0.95 }), 0, 0.03, 0));
  for (let i = 0; i < 24; i++) {
    const x = (Math.random() - 0.5) * 1.5;
    const z = (Math.random() - 0.5) * 1.5;
    g.add(cone(0.04, 0.45 + Math.random() * 0.35, mat(0x4d7c0f), x, 0.35, z, 4));
  }
  return tagScene(g, "scene_grass_tall", "grass");
}

export function createSceneTree() {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.16, 1.6, mat(0x7c4a2d, { roughness: 0.85 }), 0, 0.8, 0, 10));
  g.add(cone(0.85, 1.4, mat(0x3f6212), 0, 2.0, 0, 10));
  g.add(cone(0.65, 1.1, mat(0x4d7c0f), 0, 2.7, 0, 10));
  return tagScene(g, "scene_tree", "tree");
}

export function createScenePine() {
  const g = new THREE.Group();
  g.add(cyl(0.1, 0.14, 1.8, mat(0x78350f, { roughness: 0.9 }), 0, 0.9, 0, 10));
  g.add(cone(0.9, 1.2, mat(0x166534), 0, 1.8, 0, 9));
  g.add(cone(0.7, 1.0, mat(0x15803d), 0, 2.5, 0, 9));
  g.add(cone(0.45, 0.8, mat(0x16a34a), 0, 3.1, 0, 9));
  return tagScene(g, "scene_pine", "tree");
}

export function createSceneFruitTree() {
  const g = new THREE.Group();
  g.add(cyl(0.1, 0.14, 1.3, mat(0x92400e), 0, 0.65, 0, 10));
  g.add(cone(0.7, 1.0, mat(0x3f6212), 0, 1.7, 0, 10));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(
      cyl(0.06, 0.06, 0.1, mat(0xdc2626), Math.cos(a) * 0.35, 1.55, Math.sin(a) * 0.35, 8)
    );
  }
  return tagScene(g, "scene_fruit_tree", "tree");
}

export function createSceneWood() {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.22, 1.4, mat(0x92400e, { roughness: 0.9 }), 0, 0.22, 0, 12));
  g.rotation.z = Math.PI / 2;
  return tagScene(g, "scene_wood", "wood");
}

export function createSceneFence() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    g.add(box(0.08, 0.9, 0.08, mat(0x78350f), -0.9 + i * 0.6, 0.45, 0));
  }
  g.add(box(2.0, 0.08, 0.06, mat(0x92400e), 0, 0.55, 0));
  g.add(box(2.0, 0.08, 0.06, mat(0x92400e), 0, 0.25, 0));
  return tagScene(g, "scene_fence", "wood");
}

export function createSceneCrate() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.7, 0.7, mat(0xa16207, { roughness: 0.85 }), 0, 0.35, 0));
  g.add(box(0.95, 0.06, 0.75, mat(0x78350f), 0, 0.72, 0));
  return tagScene(g, "scene_crate", "wood");
}

export function createScenePlant() {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.18, 0.35, mat(0xb45309), 0, 0.18, 0, 12));
  g.add(box(0.5, 0.08, 0.5, mat(0x44403c), 0, 0.02, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(
      cone(0.12, 0.55, mat(0x15803d), Math.cos(a) * 0.12, 0.55, Math.sin(a) * 0.12, 6)
    );
  }
  return tagScene(g, "scene_plant", "plant");
}

export function createSceneFlower() {
  const g = new THREE.Group();
  g.add(box(1.2, 0.06, 1.2, mat(0x3f6212), 0, 0.03, 0));
  const colors = [0xf472b6, 0xfbbf24, 0x60a5fa, 0xf87171, 0xa78bfa];
  for (let i = 0; i < 10; i++) {
    const x = (Math.random() - 0.5) * 1;
    const z = (Math.random() - 0.5) * 1;
    g.add(cyl(0.02, 0.02, 0.35, mat(0x166534), x, 0.2, z, 5));
    g.add(cyl(0.07, 0.07, 0.06, mat(colors[i % colors.length]), x, 0.4, z, 8));
  }
  return tagScene(g, "scene_flower", "plant");
}

export function createSceneVine() {
  const g = new THREE.Group();
  g.add(box(0.06, 1.4, 0.06, mat(0x78716c), -0.6, 0.7, 0));
  g.add(box(0.06, 1.4, 0.06, mat(0x78716c), 0.6, 0.7, 0));
  g.add(box(1.3, 0.06, 0.06, mat(0x78716c), 0, 1.35, 0));
  for (let i = 0; i < 8; i++) {
    g.add(cone(0.1, 0.35, mat(0x16a34a), -0.5 + i * 0.14, 1.1, 0.05, 5));
  }
  return tagScene(g, "scene_vine", "plant");
}

export function createSceneCrop() {
  const g = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      const x = (col - 2) * 0.35;
      const z = (row - 1) * 0.4;
      g.add(cyl(0.03, 0.03, 0.55, mat(0xca8a04), x, 0.28, z, 6));
      g.add(cone(0.1, 0.25, mat(0x65a30d), x, 0.62, z, 5));
    }
  }
  return tagScene(g, "scene_crop", "crop");
}

export function createSceneRice() {
  const g = new THREE.Group();
  g.add(box(1.6, 0.04, 1.2, mat(0x38bdf8, { transparent: true, opacity: 0.35 }), 0, 0.05, 0));
  for (let i = 0; i < 16; i++) {
    const x = (Math.random() - 0.5) * 1.3;
    const z = (Math.random() - 0.5) * 0.9;
    g.add(cyl(0.02, 0.02, 0.55, mat(0x4d7c0f), x, 0.3, z, 4));
    g.add(cone(0.08, 0.2, mat(0x65a30d), x, 0.6, z, 4));
  }
  return tagScene(g, "scene_rice", "crop");
}

export function createSceneWheat() {
  const g = new THREE.Group();
  for (let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * 1.6;
    const z = (Math.random() - 0.5) * 1.2;
    g.add(cyl(0.015, 0.015, 0.7, mat(0xca8a04), x, 0.35, z, 4));
    g.add(cone(0.05, 0.18, mat(0xfbbf24), x, 0.75, z, 4));
  }
  return tagScene(g, "scene_wheat", "crop");
}

export function createSceneCorn() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.35;
    g.add(cyl(0.04, 0.05, 1.4, mat(0x4d7c0f), x, 0.7, 0, 6));
    g.add(cone(0.12, 0.35, mat(0x65a30d), x, 1.5, 0, 5));
    g.add(cyl(0.06, 0.06, 0.25, mat(0xfbbf24), x + 0.08, 0.9, 0.05, 8));
  }
  return tagScene(g, "scene_corn", "crop");
}

export function createSceneTomato() {
  const g = new THREE.Group();
  g.add(box(0.05, 1.2, 0.05, mat(0x78716c), -0.25, 0.6, 0));
  g.add(box(0.05, 1.2, 0.05, mat(0x78716c), 0.25, 0.6, 0));
  g.add(box(0.6, 0.04, 0.04, mat(0x78716c), 0, 1.1, 0));
  for (let i = 0; i < 6; i++) {
    g.add(cone(0.12, 0.3, mat(0x16a34a), (i % 3) * 0.2 - 0.2, 0.7 + (i % 2) * 0.25, 0.05, 5));
    g.add(cyl(0.06, 0.06, 0.08, mat(0xdc2626), (i % 3) * 0.2 - 0.2, 0.55 + (i % 2) * 0.2, 0.12, 8));
  }
  return tagScene(g, "scene_tomato", "crop");
}

export function createSceneRock() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.35, 0.55, mat(0x78716c, { roughness: 0.95 }), 0, 0.18, 0));
  g.add(box(0.4, 0.25, 0.35, mat(0x57534e, { roughness: 0.95 }), 0.25, 0.2, 0.15));
  return tagScene(g, "scene_rock", "prop");
}

export function createScenePath() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    g.add(box(0.55, 0.06, 0.4, mat(0xa8a29e, { roughness: 0.9 }), 0, 0.03, -0.7 + i * 0.5));
  }
  return tagScene(g, "scene_path", "road");
}

/** —— 建筑 / 马路（天际线式分区） —— */
export function createHouseSmall() {
  const g = new THREE.Group();
  g.add(box(2.2, 1.4, 1.8, mat(0xf5f0e6), 0, 0.7, 0));
  g.add(box(2.4, 0.12, 2.0, mat(0xb91c1c), 0, 1.55, 0));
  const roof = box(2.5, 0.7, 2.1, mat(0x991b1b), 0, 1.95, 0);
  roof.scale.set(1, 0.55, 1);
  g.add(roof);
  g.add(box(0.4, 0.7, 0.08, mat(0x78350f), 0, 0.4, 0.91));
  g.add(box(0.35, 0.35, 0.06, mat(0x7dd3fc), -0.55, 0.9, 0.91));
  g.add(box(0.35, 0.35, 0.06, mat(0x7dd3fc), 0.55, 0.9, 0.91));
  return tagScene(g, "bld_house_small", "residential");
}

export function createHouseTwo() {
  const g = new THREE.Group();
  g.add(box(2.4, 2.4, 2.0, mat(0xe7e5e4), 0, 1.2, 0));
  g.add(box(2.6, 0.7, 2.2, mat(0x9a3412), 0, 2.7, 0));
  g.add(box(0.45, 0.85, 0.08, mat(0x44403c), 0.4, 0.45, 1.01));
  g.add(box(0.4, 0.4, 0.06, mat(0xbae6fd), -0.6, 1.7, 1.01));
  g.add(box(0.4, 0.4, 0.06, mat(0xbae6fd), 0.55, 1.7, 1.01));
  g.add(box(0.4, 0.4, 0.06, mat(0xbae6fd), -0.6, 0.85, 1.01));
  return tagScene(g, "bld_house_two", "residential");
}

export function createApartment() {
  const g = new THREE.Group();
  g.add(box(3.2, 4.2, 2.2, mat(0xcbd5e1), 0, 2.1, 0));
  g.add(box(3.3, 0.15, 2.3, mat(0x475569), 0, 4.25, 0));
  for (let floor = 0; floor < 4; floor++) {
    for (let col = 0; col < 3; col++) {
      g.add(
        box(0.35, 0.4, 0.06, mat(0x7dd3fc), -0.9 + col * 0.9, 0.7 + floor * 0.95, 1.12)
      );
    }
  }
  return tagScene(g, "bld_apartment", "residential");
}

export function createGreenhouseBld() {
  const g = new THREE.Group();
  const frame = mat(0x94a3b8, { metalness: 0.4, roughness: 0.4 });
  const glass = mat(0xbbf7d0, { transparent: true, opacity: 0.45, roughness: 0.2 });
  g.add(box(4.0, 0.08, 2.4, mat(0x78716c), 0, 0.04, 0));
  g.add(box(3.8, 1.6, 0.08, glass, 0, 0.9, 1.15));
  g.add(box(3.8, 1.6, 0.08, glass, 0, 0.9, -1.15));
  g.add(box(0.08, 1.6, 2.2, glass, 1.9, 0.9, 0));
  g.add(box(0.08, 1.6, 2.2, glass, -1.9, 0.9, 0));
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.06, 1.7, 2.3, frame, i * 0.85, 0.95, 0));
  }
  g.add(box(4.0, 0.08, 2.5, frame, 0, 1.85, 0));
  return tagScene(g, "bld_greenhouse", "greenhouse");
}

export function createGlasshouse() {
  const g = new THREE.Group();
  const glass = mat(0xa5f3fc, { transparent: true, opacity: 0.4 });
  g.add(box(3.2, 2.0, 2.6, glass, 0, 1.0, 0));
  g.add(box(3.4, 0.12, 2.8, mat(0x64748b), 0, 2.1, 0));
  g.add(box(3.2, 0.08, 2.6, mat(0x57534e), 0, 0.04, 0));
  return tagScene(g, "bld_glasshouse", "greenhouse");
}

export function createShop() {
  const g = new THREE.Group();
  g.add(box(2.8, 1.8, 2.0, mat(0xfef3c7), 0, 0.9, 0));
  g.add(box(3.0, 0.5, 2.2, mat(0x1d4ed8), 0, 2.05, 0));
  g.add(box(1.4, 0.8, 0.08, mat(0x38bdf8), 0, 1.0, 1.02));
  g.add(box(0.5, 1.0, 0.08, mat(0x78350f), -0.9, 0.55, 1.02));
  g.add(box(2.0, 0.35, 0.12, mat(0xdc2626), 0, 1.85, 1.05));
  return tagScene(g, "bld_shop", "shop");
}

export function createMarket() {
  const g = new THREE.Group();
  g.add(box(2.2, 0.08, 1.4, mat(0xa16207), 0, 0.7, 0));
  g.add(cyl(0.05, 0.05, 1.4, mat(0x78716c), -0.9, 0.7, -0.55, 8));
  g.add(cyl(0.05, 0.05, 1.4, mat(0x78716c), 0.9, 0.7, -0.55, 8));
  g.add(cyl(0.05, 0.05, 1.4, mat(0x78716c), -0.9, 0.7, 0.55, 8));
  g.add(cyl(0.05, 0.05, 1.4, mat(0x78716c), 0.9, 0.7, 0.55, 8));
  g.add(box(2.4, 0.06, 1.6, mat(0xf97316), 0, 1.4, 0));
  return tagScene(g, "bld_market", "shop");
}

export function createWarehouse() {
  const g = new THREE.Group();
  g.add(box(3.4, 2.2, 2.4, mat(0x94a3b8), 0, 1.1, 0));
  g.add(box(3.6, 0.4, 2.6, mat(0x64748b), 0, 2.35, 0));
  g.add(box(1.2, 1.5, 0.08, mat(0x334155), 0, 0.8, 1.22));
  return tagScene(g, "bld_warehouse", "shop");
}

/** 单格马路（2×2）：与网格吸附一致，由 roadAutotile 按邻接换型/旋转 */
function roadDeck(g) {
  g.add(box(2.0, 0.08, 2.0, mat(0x3f3f46, { roughness: 0.92 }), 0, 0.04, 0));
}
function roadDashZ(g, z0, z1, step = 0.45) {
  const yellow = mat(0xfbbf24);
  for (let z = z0; z <= z1 + 1e-6; z += step) {
    g.add(box(0.12, 0.02, 0.32, yellow, 0, 0.09, z));
  }
}
function roadDashX(g, x0, x1, step = 0.45) {
  const yellow = mat(0xfbbf24);
  for (let x = x0; x <= x1 + 1e-6; x += step) {
    g.add(box(0.32, 0.02, 0.12, yellow, x, 0.09, 0));
  }
}
function roadCurbZ(g) {
  const white = mat(0xf8fafc);
  g.add(box(0.06, 0.03, 1.95, white, 0.88, 0.08, 0));
  g.add(box(0.06, 0.03, 1.95, white, -0.88, 0.08, 0));
}

/** 路端：默认朝 +Z */
export function createRoadTile() {
  const g = new THREE.Group();
  roadDeck(g);
  roadDashZ(g, 0.15, 0.85, 0.4);
  roadCurbZ(g);
  return tagScene(g, "road_tile", "road");
}

/** 直道：默认沿 Z（±Z） */
export function createRoadStraight() {
  const g = new THREE.Group();
  roadDeck(g);
  roadDashZ(g, -0.75, 0.75, 0.5);
  roadCurbZ(g);
  return tagScene(g, "road_straight", "road");
}

/** 十字路口 */
export function createRoadCross() {
  const g = new THREE.Group();
  roadDeck(g);
  roadDashZ(g, -0.75, -0.35, 0.4);
  roadDashZ(g, 0.35, 0.75, 0.4);
  roadDashX(g, -0.75, -0.35, 0.4);
  roadDashX(g, 0.35, 0.75, 0.4);
  return tagScene(g, "road_cross", "road");
}

export function createRoadSidewalk() {
  const g = new THREE.Group();
  g.add(box(2.0, 0.1, 2.0, mat(0xa8a29e, { roughness: 0.88 }), 0, 0.05, 0));
  g.add(box(1.85, 0.02, 1.85, mat(0xd6d3d1), 0, 0.11, 0));
  return tagScene(g, "road_sidewalk", "road");
}

/** 通用小板：底板 + 芯片块 */
function boardKit(color, chipColor, w, d, partId, label) {
  const g = new THREE.Group();
  g.add(box(w, 0.1, d, mat(color), 0, 0, 0));
  g.add(box(w * 0.35, 0.08, d * 0.45, mat(chipColor, { metalness: 0.35 }), -w * 0.15, 0.09, 0));
  markPart(g, partId, label);
  return g;
}

export function createDevEsp32s3() {
  const g = boardKit(0x111827, 0x1e293b, 1.25, 0.55, "mcu", "ESP32-S3");
  g.add(cyl(0.03, 0.03, 0.45, mat(0xcbd5e1, { metalness: 0.6 }), 0.45, 0.3, -0.1, 8));
  return g;
}
export function createDevArduinoNano() {
  return boardKit(0x0ea5e9, 0x0f172a, 0.95, 0.4, "mcu", "Arduino Nano");
}
export function createDevRpi4() {
  const g = boardKit(0x166534, 0x1e293b, 1.7, 1.1, "gateway", "树莓派 4");
  g.add(box(0.35, 0.15, 0.45, mat(0x64748b), 0.55, 0.12, 0.2));
  return g;
}
export function createDevNrf() {
  return boardKit(0x7c2d12, 0x0f172a, 0.9, 0.5, "mcu", "nRF52840");
}
export function createDevDht22() {
  const g = new THREE.Group();
  g.add(box(0.6, 0.08, 0.75, mat(0x1e293b), 0, 0, 0));
  g.add(box(0.4, 0.4, 0.22, mat(0x334155), 0, 0.24, 0.1));
  markPart(g, "sensor_temp", "DHT22");
  return g;
}
export function createDevBmp280() {
  const g = new THREE.Group();
  g.add(box(0.55, 0.08, 0.45, mat(0x14532d), 0, 0, 0));
  g.add(box(0.2, 0.06, 0.2, mat(0x0f172a), 0, 0.07, 0));
  markPart(g, "pressure", "BMP280");
  return g;
}
export function createDevBh1750() {
  const g = new THREE.Group();
  g.add(box(0.55, 0.08, 0.4, mat(0x1e3a5f), 0, 0, 0));
  g.add(cyl(0.08, 0.08, 0.06, mat(0xfef3c7), 0.1, 0.08, 0, 12));
  markPart(g, "lux", "BH1750");
  return g;
}
export function createDevPh() {
  const g = new THREE.Group();
  g.add(box(0.4, 0.08, 0.7, mat(0x334155), 0, 0.4, 0));
  g.add(cyl(0.05, 0.05, 0.9, mat(0x94a3b8), 0, 0, 0, 8));
  g.add(cyl(0.07, 0.07, 0.15, mat(0x22c55e), 0, -0.4, 0, 8));
  markPart(g, "ph_sensor", "pH 探头");
  return g;
}
export function createDevRain() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.08, 0.9, mat(0x0f172a), 0, 0, 0));
  g.add(box(0.55, 0.04, 0.7, mat(0x38bdf8), 0, 0.06, 0));
  markPart(g, "rain", "雨滴传感器");
  return g;
}
export function createDevFlow() {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.22, 0.55, mat(0x0ea5e9, { metalness: 0.4 }), 0, 0.28, 0, 14));
  g.add(cyl(0.1, 0.1, 0.4, mat(0x64748b), 0.3, 0.28, 0, 8));
  markPart(g, "flow", "流量计");
  return g;
}
export function createDevMq135() {
  const g = createDevMq2();
  markPart(g, "gas_sensor", "MQ-135");
  return g;
}
export function createDevGps() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.1, 0.7, mat(0x1e293b), 0, 0, 0));
  g.add(box(0.45, 0.06, 0.45, mat(0x22c55e), 0, 0.08, 0));
  g.add(cyl(0.03, 0.03, 0.5, mat(0xcbd5e1), 0.25, 0.35, 0.2, 8));
  markPart(g, "gps", "GPS 模块");
  return g;
}
export function createDevButton() {
  const g = new THREE.Group();
  g.add(box(0.55, 0.08, 0.4, mat(0x334155), 0, 0, 0));
  g.add(cyl(0.1, 0.1, 0.08, mat(0xef4444), 0, 0.1, 0, 12));
  markPart(g, "button", "按键模块");
  return g;
}
export function createDevStepper() {
  const g = new THREE.Group();
  g.add(cyl(0.28, 0.28, 0.45, mat(0x334155, { metalness: 0.4 }), 0, 0.25, 0, 16));
  g.add(cyl(0.08, 0.08, 0.25, mat(0xcbd5e1), 0, 0.55, 0, 10));
  markPart(g, "stepper", "步进电机");
  return g;
}
export function createDevBuzzer() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.08, 0.4, mat(0x1e293b), 0, 0, 0));
  g.add(cyl(0.14, 0.14, 0.18, mat(0x000000), 0, 0.14, 0, 14));
  markPart(g, "buzzer", "蜂鸣器");
  return g;
}
export function createDevHeater() {
  const g = new THREE.Group();
  g.add(box(1.2, 0.08, 0.8, mat(0x78716c), 0, 0.04, 0));
  g.add(box(1.0, 0.04, 0.6, mat(0xef4444, { emissive: 0xb91c1c, emissiveIntensity: 0.25 }), 0, 0.1, 0));
  markPart(g, "heater", "加热垫");
  return g;
}
export function createDevSprinkler() {
  const g = new THREE.Group();
  g.add(cyl(0.08, 0.08, 0.7, mat(0x64748b), 0, 0.35, 0, 10));
  g.add(cyl(0.18, 0.05, 0.12, mat(0x0ea5e9), 0, 0.75, 0, 12));
  markPart(g, "sprinkler", "喷灌头");
  return g;
}
export function createDevRgb() {
  const g = new THREE.Group();
  g.add(box(0.45, 0.08, 0.35, mat(0x111827), 0, 0, 0));
  g.add(box(0.12, 0.06, 0.12, mat(0xef4444), -0.12, 0.08, 0));
  g.add(box(0.12, 0.06, 0.12, mat(0x22c55e), 0, 0.08, 0));
  g.add(box(0.12, 0.06, 0.12, mat(0x3b82f6), 0.12, 0.08, 0));
  markPart(g, "rgb", "RGB 灯珠");
  return g;
}
export function createDevBt() {
  const g = new THREE.Group();
  g.add(box(0.75, 0.1, 0.4, mat(0x1d4ed8), 0, 0, 0));
  g.add(cyl(0.03, 0.03, 0.55, mat(0xcbd5e1), 0.28, 0.35, 0, 8));
  markPart(g, "bluetooth", "蓝牙 HC-05");
  return g;
}
export function createDevTft() {
  const g = new THREE.Group();
  g.add(box(1.0, 0.1, 0.75, mat(0x1e293b), 0, 0, 0));
  g.add(box(0.8, 0.04, 0.55, mat(0x0ea5e9, { emissive: 0x0284c7, emissiveIntensity: 0.2 }), 0, 0.08, 0));
  markPart(g, "tft", "TFT 彩屏");
  return g;
}
export function createDevNbiot() {
  const g = new THREE.Group();
  g.add(box(0.85, 0.1, 0.5, mat(0x4c1d95), 0, 0, 0));
  g.add(cyl(0.03, 0.03, 0.65, mat(0xcbd5e1), 0.3, 0.4, 0, 8));
  markPart(g, "nbiot", "NB-IoT");
  return g;
}
export function createDevRs485() {
  return boardKit(0x365314, 0x0f172a, 0.85, 0.5, "rs485", "RS485");
}
export function createDevSd() {
  const g = new THREE.Group();
  g.add(box(0.7, 0.1, 0.55, mat(0x1e293b), 0, 0, 0));
  g.add(box(0.35, 0.05, 0.4, mat(0x000000), 0.1, 0.08, 0));
  markPart(g, "sd", "SD 卡模块");
  return g;
}
export function createDevBattery() {
  const g = new THREE.Group();
  g.add(box(1.1, 0.35, 0.55, mat(0x365314), 0, 0.18, 0));
  g.add(box(0.15, 0.12, 0.2, mat(0xcbd5e1), 0.55, 0.25, 0));
  markPart(g, "battery", "电池组");
  return g;
}
export function createDevBreadboard() {
  const g = new THREE.Group();
  g.add(box(2.0, 0.12, 1.1, mat(0xf8fafc), 0, 0.06, 0));
  for (let i = 0; i < 10; i++) {
    g.add(box(0.06, 0.04, 0.8, mat(0x94a3b8), -0.8 + i * 0.18, 0.14, 0));
  }
  markPart(g, "breadboard", "面包板");
  return g;
}

export function createVilla() {
  const g = new THREE.Group();
  g.add(box(3.2, 1.6, 2.6, mat(0xfafaf9), 0, 0.8, 0));
  g.add(box(2.0, 1.2, 2.0, mat(0xf5f5f4), 0.8, 2.0, 0));
  g.add(box(3.4, 0.5, 2.8, mat(0x9a3412), 0, 1.85, 0));
  g.add(box(2.2, 0.4, 2.2, mat(0x9a3412), 0.8, 2.75, 0));
  return tagScene(g, "bld_villa", "residential");
}
export function createTownhouse() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(box(1.6, 2.2, 2.0, mat(i % 2 ? 0xe7e5e4 : 0xf5f5f4), (i - 1) * 1.7, 1.1, 0));
    g.add(box(0.35, 0.35, 0.06, mat(0x7dd3fc), (i - 1) * 1.7, 1.5, 1.02));
  }
  return tagScene(g, "bld_townhouse", "residential");
}
export function createCourtyard() {
  const g = new THREE.Group();
  g.add(box(5.0, 1.4, 0.4, mat(0xd6d3d1), 0, 0.7, 2.2));
  g.add(box(5.0, 1.4, 0.4, mat(0xd6d3d1), 0, 0.7, -2.2));
  g.add(box(0.4, 1.4, 4.0, mat(0xd6d3d1), 2.3, 0.7, 0));
  g.add(box(0.4, 1.4, 4.0, mat(0xd6d3d1), -2.3, 0.7, 0));
  g.add(box(1.8, 0.08, 1.8, mat(0x4d7c0f), 0, 0.04, 0));
  return tagScene(g, "bld_courtyard", "residential");
}
export function createNursery() {
  const g = new THREE.Group();
  g.add(box(2.4, 0.08, 1.2, mat(0x78716c), 0, 0.7, 0));
  for (let i = 0; i < 6; i++) {
    g.add(cyl(0.1, 0.08, 0.25, mat(0xb45309), -0.9 + i * 0.35, 0.9, 0, 10));
    g.add(cone(0.12, 0.25, mat(0x16a34a), -0.9 + i * 0.35, 1.15, 0, 6));
  }
  return tagScene(g, "bld_nursery", "greenhouse");
}
export function createTank() {
  const g = new THREE.Group();
  g.add(cyl(0.7, 0.7, 1.4, mat(0x0ea5e9, { metalness: 0.25 }), 0, 0.7, 0, 18));
  g.add(cyl(0.75, 0.75, 0.1, mat(0x64748b), 0, 1.4, 0, 18));
  return tagScene(g, "bld_tank", "greenhouse");
}
export function createShade() {
  const g = new THREE.Group();
  g.add(box(0.08, 1.6, 0.08, mat(0x78716c), -1.5, 0.8, -1));
  g.add(box(0.08, 1.6, 0.08, mat(0x78716c), 1.5, 0.8, -1));
  g.add(box(0.08, 1.6, 0.08, mat(0x78716c), -1.5, 0.8, 1));
  g.add(box(0.08, 1.6, 0.08, mat(0x78716c), 1.5, 0.8, 1));
  g.add(box(3.2, 0.06, 2.2, mat(0x365314, { transparent: true, opacity: 0.55 }), 0, 1.6, 0));
  return tagScene(g, "bld_shade", "greenhouse");
}
export function createCafe() {
  const g = new THREE.Group();
  g.add(box(2.6, 1.7, 2.2, mat(0xfef3c7), 0, 0.85, 0));
  g.add(box(2.8, 0.45, 2.4, mat(0x78350f), 0, 1.9, 0));
  g.add(box(1.2, 0.9, 0.08, mat(0x7dd3fc), 0.3, 1.0, 1.12));
  g.add(cyl(0.25, 0.25, 0.08, mat(0xffffff), -0.7, 0.55, 1.4, 12));
  return tagScene(g, "bld_cafe", "shop");
}
export function createFarmStore() {
  const g = new THREE.Group();
  g.add(box(3.0, 1.9, 2.2, mat(0xdcfce7), 0, 0.95, 0));
  g.add(box(3.2, 0.5, 2.4, mat(0x166534), 0, 2.1, 0));
  g.add(box(1.6, 0.9, 0.08, mat(0x38bdf8), 0, 1.0, 1.12));
  return tagScene(g, "bld_farm_store", "shop");
}
export function createWillow() {
  const g = new THREE.Group();
  g.add(cyl(0.1, 0.14, 1.8, mat(0x7c4a2d), 0, 0.9, 0, 10));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(cone(0.35, 1.2, mat(0x4d7c0f), Math.cos(a) * 0.4, 1.8, Math.sin(a) * 0.4, 6));
  }
  return tagScene(g, "scene_willow", "decoration");
}
export function createPalm() {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.18, 2.2, mat(0xa16207), 0, 1.1, 0, 10));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = box(0.15, 0.08, 1.2, mat(0x16a34a), Math.cos(a) * 0.5, 2.2, Math.sin(a) * 0.5);
    leaf.rotation.y = a;
    g.add(leaf);
  }
  return tagScene(g, "scene_palm", "decoration");
}
export function createBamboo() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const x = (Math.random() - 0.5) * 0.8;
    const z = (Math.random() - 0.5) * 0.8;
    g.add(cyl(0.04, 0.04, 1.4 + Math.random() * 0.5, mat(0x4d7c0f), x, 0.8, z, 6));
  }
  return tagScene(g, "scene_bamboo", "decoration");
}
export function createSunflower() {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.04, 1.0, mat(0x4d7c0f), 0, 0.5, 0, 6));
  g.add(cyl(0.22, 0.22, 0.08, mat(0xfbbf24), 0, 1.05, 0, 14));
  g.add(cyl(0.1, 0.1, 0.06, mat(0x78350f), 0, 1.1, 0, 10));
  return tagScene(g, "scene_sunflower", "decoration");
}
export function createBench() {
  const g = new THREE.Group();
  g.add(box(1.6, 0.08, 0.45, mat(0xa16207), 0, 0.45, 0));
  g.add(box(1.6, 0.4, 0.08, mat(0xa16207), 0, 0.7, -0.2));
  g.add(box(0.08, 0.45, 0.4, mat(0x78716c), -0.7, 0.22, 0));
  g.add(box(0.08, 0.45, 0.4, mat(0x78716c), 0.7, 0.22, 0));
  return tagScene(g, "scene_bench", "decoration");
}
export function createFountain() {
  const g = new THREE.Group();
  g.add(cyl(0.9, 0.9, 0.25, mat(0xa8a29e), 0, 0.12, 0, 16));
  g.add(cyl(0.35, 0.35, 0.7, mat(0x78716c), 0, 0.55, 0, 12));
  g.add(cyl(0.2, 0.2, 0.15, mat(0x38bdf8, { transparent: true, opacity: 0.6 }), 0, 0.95, 0, 12));
  return tagScene(g, "scene_fountain", "decoration");
}
export function createMailbox() {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.05, 0.9, mat(0x64748b), 0, 0.45, 0, 8));
  g.add(box(0.35, 0.4, 0.25, mat(0x1d4ed8), 0, 1.0, 0));
  return tagScene(g, "scene_mailbox", "decoration");
}
export function createLampDeco() {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, 1.5, mat(0x57534e), 0, 0.75, 0, 10));
  g.add(box(0.35, 0.2, 0.35, mat(0x1f2933), 0, 1.6, 0));
  g.add(box(0.28, 0.08, 0.28, mat(0xfff4c2, { emissive: 0xffd56a, emissiveIntensity: 0.3 }), 0, 1.48, 0));
  return tagScene(g, "scene_lamp_deco", "decoration");
}
/** 丁字路口：默认连通 ±Z 与 +X（缺 -X） */
export function createRoadT() {
  const g = new THREE.Group();
  roadDeck(g);
  roadDashZ(g, -0.75, 0.75, 0.5);
  roadDashX(g, 0.35, 0.75, 0.4);
  g.add(box(0.06, 0.03, 1.95, mat(0xf8fafc), -0.88, 0.08, 0));
  return tagScene(g, "road_t", "road");
}

/** 弯道：默认连通 +Z 与 +X */
export function createRoadCurve() {
  const g = new THREE.Group();
  roadDeck(g);
  roadDashZ(g, 0.2, 0.8, 0.4);
  roadDashX(g, 0.2, 0.8, 0.4);
  g.add(box(0.06, 0.03, 1.1, mat(0xf8fafc), -0.88, 0.08, -0.4));
  g.add(box(1.1, 0.03, 0.06, mat(0xf8fafc), -0.4, 0.08, -0.88));
  return tagScene(g, "road_curve", "road");
}
export function createRoadZebra() {
  const g = new THREE.Group();
  g.add(box(2.0, 0.08, 2.0, mat(0x3f3f46), 0, 0.04, 0));
  for (let i = 0; i < 5; i++) {
    g.add(box(0.25, 0.02, 1.6, mat(0xf8fafc), -0.8 + i * 0.4, 0.09, 0));
  }
  return tagScene(g, "road_zebra", "road");
}
export function createParking() {
  const g = new THREE.Group();
  g.add(box(2.4, 0.08, 4.0, mat(0x52525b), 0, 0.04, 0));
  g.add(box(0.08, 0.02, 3.6, mat(0xf8fafc), -1.0, 0.09, 0));
  g.add(box(0.08, 0.02, 3.6, mat(0xf8fafc), 1.0, 0.09, 0));
  return tagScene(g, "road_parking", "road");
}
export function createBridge() {
  const g = new THREE.Group();
  g.add(box(2.2, 0.15, 5.0, mat(0x78716c), 0, 0.6, 0));
  g.add(box(0.12, 0.5, 5.0, mat(0xa8a29e), 1.0, 0.9, 0));
  g.add(box(0.12, 0.5, 5.0, mat(0xa8a29e), -1.0, 0.9, 0));
  g.add(cyl(0.15, 0.15, 0.7, mat(0x57534e), 0.8, 0.3, 2, 8));
  g.add(cyl(0.15, 0.15, 0.7, mat(0x57534e), -0.8, 0.3, 2, 8));
  g.add(cyl(0.15, 0.15, 0.7, mat(0x57534e), 0.8, 0.3, -2, 8));
  g.add(cyl(0.15, 0.15, 0.7, mat(0x57534e), -0.8, 0.3, -2, 8));
  return tagScene(g, "road_bridge", "road");
}

const BUILTIN_BUILDERS = {
  street_light: createStreetLightBuiltin,
  dev_mcu: createDevMcu,
  dev_esp32: createDevEsp32,
  dev_esp32s3: createDevEsp32s3,
  dev_esp8266: createDevEsp8266,
  dev_arduino: createDevArduino,
  dev_arduino_nano: createDevArduinoNano,
  dev_rpi: createDevRpi,
  dev_rpi4: createDevRpi4,
  dev_nrf: createDevNrf,
  dev_relay: createDevRelay,
  dev_wifi: createDevWifi,
  dev_ldr: createDevLdr,
  dev_lamp: createDevLamp,
  dev_dht11: createDevDht11,
  dev_dht22: createDevDht22,
  dev_bmp280: createDevBmp280,
  dev_bh1750: createDevBh1750,
  dev_soil: createDevSoil,
  dev_ph: createDevPh,
  dev_rain: createDevRain,
  dev_flow: createDevFlow,
  dev_ultrasonic: createDevUltrasonic,
  dev_mq2: createDevMq2,
  dev_mq135: createDevMq135,
  dev_pir: createDevPir,
  dev_water: createDevWater,
  dev_gps: createDevGps,
  dev_camera: createDevCamera,
  dev_button: createDevButton,
  dev_servo: createDevServo,
  dev_stepper: createDevStepper,
  dev_pump: createDevPump,
  dev_valve: createDevValve,
  dev_fan: createDevFan,
  dev_buzzer: createDevBuzzer,
  dev_heater: createDevHeater,
  dev_sprinkler: createDevSprinkler,
  dev_led: createDevLed,
  dev_rgb: createDevRgb,
  dev_oled: createDevOled,
  dev_tft: createDevTft,
  dev_lora: createDevLora,
  dev_bt: createDevBt,
  dev_nbiot: createDevNbiot,
  dev_rs485: createDevRs485,
  dev_sd: createDevSd,
  dev_battery: createDevBattery,
  dev_breadboard: createDevBreadboard,
  scene_grass: createSceneGrass,
  scene_grass_tall: createSceneGrassTall,
  scene_tree: createSceneTree,
  scene_pine: createScenePine,
  scene_fruit_tree: createSceneFruitTree,
  scene_willow: createWillow,
  scene_palm: createPalm,
  scene_bamboo: createBamboo,
  scene_wood: createSceneWood,
  scene_fence: createSceneFence,
  scene_crate: createSceneCrate,
  scene_plant: createScenePlant,
  scene_flower: createSceneFlower,
  scene_sunflower: createSunflower,
  scene_vine: createSceneVine,
  scene_crop: createSceneCrop,
  scene_rice: createSceneRice,
  scene_wheat: createSceneWheat,
  scene_corn: createSceneCorn,
  scene_tomato: createSceneTomato,
  scene_rock: createSceneRock,
  scene_path: createScenePath,
  scene_bench: createBench,
  scene_fountain: createFountain,
  scene_mailbox: createMailbox,
  scene_lamp_deco: createLampDeco,
  bld_house_small: createHouseSmall,
  bld_house_two: createHouseTwo,
  bld_apartment: createApartment,
  bld_villa: createVilla,
  bld_townhouse: createTownhouse,
  bld_courtyard: createCourtyard,
  bld_greenhouse: createGreenhouseBld,
  bld_glasshouse: createGlasshouse,
  bld_nursery: createNursery,
  bld_tank: createTank,
  bld_shade: createShade,
  bld_shop: createShop,
  bld_market: createMarket,
  bld_warehouse: createWarehouse,
  bld_cafe: createCafe,
  bld_farm_store: createFarmStore,
  road_tile: createRoadTile,
  road_straight: createRoadStraight,
  road_cross: createRoadCross,
  road_sidewalk: createRoadSidewalk,
  road_t: createRoadT,
  road_curve: createRoadCurve,
  road_zebra: createRoadZebra,
  road_parking: createParking,
  road_bridge: createBridge,
};

export function listBuiltinIds() {
  return Object.keys(BUILTIN_BUILDERS);
}

export function createBuiltinModel(id) {
  const fn = BUILTIN_BUILDERS[id];
  if (!fn) return null;
  return fn();
}
