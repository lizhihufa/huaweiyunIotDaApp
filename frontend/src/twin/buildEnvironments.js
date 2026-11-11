import * as THREE from "three";
import {
  CROP_OPTIONS,
  FARM_CROP_OPTIONS,
  cropMeta,
  mergeSceneConfig,
} from "./sceneConfig";
import { resolveEnvId } from "./sceneTypes";

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.15,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
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

function cyl(rTop, rBot, h, material, x = 0, y = 0, z = 0, segs = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** @returns {THREE.Group} */
export function buildEnvironment(sceneType, config = {}) {
  const env = resolveEnvId(sceneType);
  const cfg = mergeSceneConfig(env, config);
  switch (env) {
    case "blank":
      return buildBlank(cfg);
    case "room":
      return buildRoom(cfg);
    case "greenhouse":
      return buildGreenhouse(cfg);
    case "farm":
      return buildFarm(cfg);
    case "rice_paddy":
      return buildRicePaddy(cfg);
    case "street":
    default:
      return buildStreet(cfg);
  }
}

/** 平整空地：大平面 + 网格，方便自由放置 */
function buildBlank(cfg) {
  const g = new THREE.Group();
  g.name = "env_blank";
  const size = 64;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    mat(0xb7c9b4, { roughness: 0.95, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  ground.name = "flatGround";
  g.add(ground);

  const gridStep = Math.max(1, Number(cfg.grid_size) || 2);
  const grid = new THREE.GridHelper(size, Math.floor(size / gridStep), 0x6b8f71, 0x9bb39a);
  grid.position.y = 0.01;
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
  mats.forEach((m) => {
    m.transparent = true;
    m.opacity = 0.55;
  });
  grid.name = "placeGrid";
  g.add(grid);
  return g;
}

function buildStreet(cfg) {
  const g = new THREE.Group();
  g.name = "env_street";
  const layout = cfg.street_layout || "roadside";

  g.add(box(32, 0.35, 32, mat(0x3d4a42, { roughness: 0.9 }), 0, -0.175, 0));
  const asphalt = mat(0x2a3034, { roughness: 0.85 });
  const line = mat(0xe8e0c8, { roughness: 0.7 });

  if (layout === "crossroad") {
    // 十字路口：南北 + 东西干道
    g.add(box(8, 0.08, 32, asphalt, 0, 0.02, 0));
    g.add(box(32, 0.08, 8, asphalt, 0, 0.02, 0));
    for (let i = -6; i <= 6; i++) {
      if (Math.abs(i) < 1) continue;
      g.add(box(0.25, 0.05, 1.2, line, 0, 0.06, i * 2.2));
      g.add(box(1.2, 0.05, 0.25, line, i * 2.2, 0.06, 0));
    }
    // 路口人行斑马线示意
    for (let i = -3; i <= 3; i++) {
      g.add(box(0.35, 0.04, 2.2, line, i * 0.55, 0.05, 4.2));
      g.add(box(0.35, 0.04, 2.2, line, i * 0.55, 0.05, -4.2));
    }
    // 四角绿化
    for (const [x, z] of [
      [8, 8],
      [-8, 8],
      [8, -8],
      [-8, -8],
    ]) {
      g.add(cyl(0.01, 1.0, 1.5, mat(0x3f7d5a), x, 2.0, z, 8));
      g.add(cyl(0.12, 0.16, 1.2, mat(0x6b4f3a), x, 0.7, z, 8));
    }
  } else {
    // 路边单行道
    g.add(box(8, 0.08, 28, asphalt, 0, 0.02, 0));
    for (let i = -5; i <= 5; i++) g.add(box(0.25, 0.05, 1.2, line, 0, 0.06, i * 2.4));
    // 人行道
    g.add(box(3.5, 0.12, 28, mat(0x9aa3a8, { roughness: 0.8 }), -6.2, 0.05, 0));
    g.add(box(3.5, 0.12, 28, mat(0x9aa3a8, { roughness: 0.8 }), 6.2, 0.05, 0));
    g.add(cyl(0.01, 1.1, 1.6, mat(0x3f7d5a), 5.5, 2.2, -2.5, 8));
    g.add(cyl(0.12, 0.16, 1.4, mat(0x6b4f3a), 5.5, 0.8, -2.5, 8));
  }
  return g;
}

/** —— 室内家具 / 构件 —— */
function addBaseboard(g, x0, z0, x1, z1, y0, matTrim) {
  const thick = 0.04;
  const h = 0.12;
  if (Math.abs(x1 - x0) > 0.2) {
    g.add(box(Math.abs(x1 - x0), h, thick, matTrim, (x0 + x1) / 2, y0 + h / 2, z0));
  }
  if (Math.abs(z1 - z0) > 0.2) {
    g.add(box(thick, h, Math.abs(z1 - z0), matTrim, x0, y0 + h / 2, (z0 + z1) / 2));
  }
}

/** 在实墙上开洞并装窗（sill 离地高度，winH 窗高） */
function addWindowInWall(g, { axis, wallPos, center, y0, wallH, winW, winH, sill = 0.95, wallMat, frame, glass }) {
  const thick = 0.18;
  const top = wallH - (sill + winH);
  const cy = y0 + sill + winH / 2;
  if (axis === "z") {
    // 窗左右墙段由调用方拼；这里装窗框、玻璃、窗台、上下过梁
    g.add(box(winW + 0.12, top, thick, wallMat, center, y0 + sill + winH + top / 2, wallPos));
    g.add(box(winW + 0.12, sill, thick, wallMat, center, y0 + sill / 2, wallPos));
    g.add(box(winW + 0.2, 0.08, 0.22, frame, center, y0 + sill - 0.02, wallPos + 0.04));
    g.add(box(winW + 0.14, winH + 0.1, 0.06, frame, center, cy, wallPos));
    g.add(box(winW, winH, 0.03, glass, center, cy, wallPos + 0.02));
    g.add(box(0.04, winH, 0.05, frame, center, cy, wallPos));
    g.add(box(winW, 0.04, 0.05, frame, center, cy, wallPos));
    // 窗帘盒
    g.add(box(winW + 0.25, 0.1, 0.14, mat(0xe7e5e4), center, y0 + sill + winH + 0.08, wallPos + 0.12));
    g.add(box(winW * 0.45, winH * 0.9, 0.03, mat(0xf8fafc, { transparent: true, opacity: 0.75 }), center - winW * 0.22, cy, wallPos + 0.14));
  } else {
    g.add(box(thick, top, winW + 0.12, wallMat, wallPos, y0 + sill + winH + top / 2, center));
    g.add(box(thick, sill, winW + 0.12, wallMat, wallPos, y0 + sill / 2, center));
    g.add(box(0.22, 0.08, winW + 0.2, frame, wallPos + 0.04, y0 + sill - 0.02, center));
    g.add(box(0.06, winH + 0.1, winW + 0.14, frame, wallPos, cy, center));
    g.add(box(0.03, winH, winW, glass, wallPos + 0.02, cy, center));
    g.add(box(0.05, winH, 0.04, frame, wallPos, cy, center));
    g.add(box(0.05, 0.04, winW, frame, wallPos, cy, center));
    g.add(box(0.14, 0.1, winW + 0.25, mat(0xe7e5e4), wallPos + 0.12, y0 + sill + winH + 0.08, center));
  }
}

/** 沿 Z 墙（南北）按开口切分水平墙段 */
function addNorthSouthWallSegments(g, z, y0, wallH, halfW, segments, wallMat) {
  // segments: sorted [{x0,x1}] solid spans
  for (const s of segments) {
    const w = s.x1 - s.x0;
    if (w < 0.05) continue;
    g.add(box(w, wallH, 0.18, wallMat, (s.x0 + s.x1) / 2, y0 + wallH / 2, z));
  }
}

function addEastWestWallSegments(g, x, y0, wallH, segments, wallMat) {
  for (const s of segments) {
    const d = s.z1 - s.z0;
    if (d < 0.05) continue;
    g.add(box(0.18, wallH, d, wallMat, x, y0 + wallH / 2, (s.z0 + s.z1) / 2));
  }
}

function addBalcony(g, y0, wallH, mats) {
  const { tile, rail, glass, wood } = mats;
  // 客厅西侧阳台
  const bx = -10.0;
  const bz = 2.8;
  g.add(box(3.4, 0.14, 5.2, tile, bx, y0 + 0.02, bz));
  // 外沿梁
  g.add(box(3.5, 0.22, 0.18, mat(0xa8a29e), bx, y0 + 0.1, bz - 2.5));
  g.add(box(3.5, 0.22, 0.18, mat(0xa8a29e), bx, y0 + 0.1, bz + 2.5));
  g.add(box(0.18, 0.22, 5.2, mat(0xa8a29e), bx - 1.65, y0 + 0.1, bz));
  // 玻璃栏杆
  const rh = 1.1;
  g.add(box(3.3, rh, 0.04, glass, bx, y0 + rh / 2 + 0.1, bz - 2.45));
  g.add(box(3.3, rh, 0.04, glass, bx, y0 + rh / 2 + 0.1, bz + 2.45));
  g.add(box(0.04, rh, 5.0, glass, bx - 1.6, y0 + rh / 2 + 0.1, bz));
  g.add(box(3.35, 0.05, 0.06, rail, bx, y0 + rh + 0.1, bz - 2.45));
  g.add(box(3.35, 0.05, 0.06, rail, bx, y0 + rh + 0.1, bz + 2.45));
  g.add(box(0.06, 0.05, 5.05, rail, bx - 1.6, y0 + rh + 0.1, bz));
  // 立柱
  for (const z of [bz - 2.4, bz, bz + 2.4]) {
    g.add(box(0.08, rh, 0.08, rail, bx - 1.55, y0 + rh / 2 + 0.1, z));
  }
  // 晾衣架
  g.add(box(2.2, 0.04, 0.04, rail, bx, y0 + 2.15, bz - 1.2));
  g.add(box(0.04, 0.5, 0.04, rail, bx - 1.0, y0 + 1.95, bz - 1.2));
  g.add(box(0.04, 0.5, 0.04, rail, bx + 1.0, y0 + 1.95, bz - 1.2));
  // 阳台桌椅 / 绿植 / 空调外机
  g.add(box(0.7, 0.55, 0.7, wood, bx + 0.6, y0 + 0.35, bz + 1.5));
  g.add(cyl(0.18, 0.16, 0.45, mat(0x57534e), bx + 0.6, y0 + 0.7, bz + 1.5, 10));
  addPlant(g, bx - 0.8, y0, bz + 1.8);
  addPlant(g, bx - 0.9, y0, bz - 1.6);
  g.add(box(0.85, 0.55, 0.35, mat(0x94a3b8, { metalness: 0.4 }), bx + 0.9, y0 + 0.9, bz - 1.8));
  g.add(box(0.7, 0.08, 0.08, mat(0x64748b), bx + 0.9, y0 + 1.25, bz - 1.8));
  // 阳台吊灯
  addCeilingLight(g, bx, y0 + wallH - 0.25, bz, 0xf8fafc);
  // 阳台顶棚（半透明雨棚，不挡俯视）
  g.add(
    box(3.5, 0.06, 5.3, mat(0xcbd5e1, { roughness: 0.35, transparent: true, opacity: 0.35 }), bx, y0 + wallH - 0.08, bz)
  );
}

function addDoorOpening(g, x, y0, z, wallH, axis, wallMat) {
  // 门洞上方过梁 + 门扇
  const doorH = 2.15;
  const doorW = 0.95;
  const woodDoor = mat(0x6b4f3a, { roughness: 0.55 });
  const handle = mat(0xd4af37, { metalness: 0.7, roughness: 0.35 });
  if (axis === "x") {
    g.add(box(0.1, wallH - doorH, doorW + 0.2, wallMat, x, y0 + doorH + (wallH - doorH) / 2, z));
    g.add(box(0.06, doorH - 0.05, doorW - 0.08, woodDoor, x + 0.04, y0 + doorH / 2, z));
    g.add(box(0.04, 0.02, 0.12, handle, x + 0.08, y0 + 1.0, z + doorW * 0.28));
  } else {
    g.add(box(doorW + 0.2, wallH - doorH, 0.1, wallMat, x, y0 + doorH + (wallH - doorH) / 2, z));
    g.add(box(doorW - 0.08, doorH - 0.05, 0.06, woodDoor, x, y0 + doorH / 2, z + 0.04));
    g.add(box(0.12, 0.02, 0.04, handle, x + doorW * 0.28, y0 + 1.0, z + 0.08));
  }
}

function addSofa(g, x, y0, z, rotY, fabric, wood) {
  const s = new THREE.Group();
  s.add(box(2.4, 0.42, 0.95, fabric, 0, 0.35, 0));
  s.add(box(2.4, 0.55, 0.22, fabric, 0, 0.7, -0.38));
  s.add(box(0.22, 0.55, 0.9, fabric, -1.1, 0.7, 0.05));
  s.add(box(0.22, 0.55, 0.9, fabric, 1.1, 0.7, 0.05));
  s.add(box(0.7, 0.18, 0.4, fabric, -0.55, 0.58, 0.1));
  s.add(box(0.7, 0.18, 0.4, fabric, 0.55, 0.58, 0.1));
  s.add(box(2.35, 0.08, 0.9, wood, 0, 0.12, 0));
  s.position.set(x, y0, z);
  s.rotation.y = rotY || 0;
  g.add(s);
}

function addArmchair(g, x, y0, z, rotY, fabric, wood) {
  const s = new THREE.Group();
  s.add(box(0.85, 0.4, 0.85, fabric, 0, 0.35, 0));
  s.add(box(0.85, 0.55, 0.18, fabric, 0, 0.7, -0.32));
  s.add(box(0.14, 0.5, 0.8, fabric, -0.38, 0.65, 0));
  s.add(box(0.14, 0.5, 0.8, fabric, 0.38, 0.65, 0));
  s.add(box(0.8, 0.06, 0.8, wood, 0, 0.12, 0));
  s.position.set(x, y0, z);
  s.rotation.y = rotY || 0;
  g.add(s);
}

function addCoffeeTable(g, x, y0, z, wood, glass) {
  g.add(box(1.15, 0.06, 0.65, wood, x, y0 + 0.42, z));
  g.add(box(1.05, 0.02, 0.55, glass, x, y0 + 0.46, z));
  g.add(box(0.08, 0.4, 0.08, wood, x - 0.45, y0 + 0.2, z - 0.22));
  g.add(box(0.08, 0.4, 0.08, wood, x + 0.45, y0 + 0.2, z - 0.22));
  g.add(box(0.08, 0.4, 0.08, wood, x - 0.45, y0 + 0.2, z + 0.22));
  g.add(box(0.08, 0.4, 0.08, wood, x + 0.45, y0 + 0.2, z + 0.22));
  g.add(box(0.18, 0.04, 0.12, mat(0xf8fafc), x - 0.25, y0 + 0.5, z));
  g.add(cyl(0.06, 0.05, 0.14, mat(0x22c55e), x + 0.28, y0 + 0.54, z + 0.1, 8));
}

function addTvUnit(g, x, y0, z, wood, black) {
  g.add(box(2.2, 0.55, 0.45, wood, x, y0 + 0.35, z));
  g.add(box(0.08, 0.45, 0.4, wood, x - 0.7, y0 + 0.35, z));
  g.add(box(0.08, 0.45, 0.4, wood, x + 0.7, y0 + 0.35, z));
  g.add(box(1.6, 0.9, 0.06, black, x, y0 + 1.35, z - 0.05));
  g.add(box(1.5, 0.8, 0.02, mat(0x0f172a, { roughness: 0.25, metalness: 0.4 }), x, y0 + 1.35, z - 0.02));
  g.add(box(0.35, 0.05, 0.2, wood, x, y0 + 0.88, z));
}

function addDiningSet(g, x, y0, z, wood, fabric) {
  g.add(box(1.8, 0.08, 0.9, wood, x, y0 + 0.78, z));
  for (const [dx, dz] of [
    [-0.75, -0.35],
    [0.75, -0.35],
    [-0.75, 0.35],
    [0.75, 0.35],
  ]) {
    g.add(box(0.07, 0.72, 0.07, wood, x + dx, y0 + 0.36, z + dz));
  }
  const chairs = [
    [0, -0.85, 0],
    [0, 0.85, Math.PI],
    [-1.2, 0, Math.PI / 2],
    [1.2, 0, -Math.PI / 2],
  ];
  for (const [cx, cz, ry] of chairs) {
    const ch = new THREE.Group();
    ch.add(box(0.42, 0.08, 0.42, wood, 0, 0.48, 0));
    ch.add(box(0.42, 0.45, 0.06, fabric, 0, 0.72, -0.18));
    ch.add(box(0.05, 0.45, 0.05, wood, -0.16, 0.24, -0.16));
    ch.add(box(0.05, 0.45, 0.05, wood, 0.16, 0.24, -0.16));
    ch.add(box(0.05, 0.45, 0.05, wood, -0.16, 0.24, 0.16));
    ch.add(box(0.05, 0.45, 0.05, wood, 0.16, 0.24, 0.16));
    ch.position.set(x + cx, y0, z + cz);
    ch.rotation.y = ry;
    g.add(ch);
  }
}

function addBed(g, x, y0, z, rotY, twin, mats) {
  const { wood, sheet, pillow, duvet } = mats;
  const w = twin ? 1.8 : 1.35;
  const d = twin ? 2.1 : 2.0;
  const s = new THREE.Group();
  s.add(box(w + 0.1, 0.28, d + 0.1, wood, 0, 0.22, 0));
  s.add(box(w, 0.22, d, sheet, 0, 0.42, 0));
  s.add(box(w * 0.95, 0.12, d * 0.55, duvet, 0, 0.52, 0.15));
  s.add(box(w * 0.38, 0.16, 0.35, pillow, -w * 0.22, 0.55, -d * 0.35));
  s.add(box(w * 0.38, 0.16, 0.35, pillow, w * 0.22, 0.55, -d * 0.35));
  s.add(box(w + 0.12, 0.7, 0.1, wood, 0, 0.55, -d / 2 - 0.02));
  s.position.set(x, y0, z);
  s.rotation.y = rotY || 0;
  g.add(s);
}

function addNightstand(g, x, y0, z, wood) {
  g.add(box(0.45, 0.5, 0.4, wood, x, y0 + 0.3, z));
  g.add(box(0.48, 0.04, 0.42, wood, x, y0 + 0.56, z));
  g.add(cyl(0.05, 0.06, 0.18, mat(0xfef3c7, { emissive: 0xffd56a, emissiveIntensity: 0.15 }), x, y0 + 0.72, z, 10));
  g.add(cyl(0.02, 0.02, 0.12, wood, x, y0 + 0.64, z, 6));
}

function addWardrobe(g, x, y0, z, rotY, wood) {
  const s = new THREE.Group();
  s.add(box(1.6, 2.3, 0.55, wood, 0, 1.2, 0));
  s.add(box(0.04, 2.15, 0.02, mat(0xd4af37, { metalness: 0.5 }), -0.02, 1.2, 0.28));
  s.add(box(0.03, 0.25, 0.04, mat(0xd4af37, { metalness: 0.55 }), -0.35, 1.2, 0.3));
  s.add(box(0.03, 0.25, 0.04, mat(0xd4af37, { metalness: 0.55 }), 0.35, 1.2, 0.3));
  s.add(box(1.55, 0.04, 0.5, wood, 0, 0.08, 0));
  s.position.set(x, y0, z);
  s.rotation.y = rotY || 0;
  g.add(s);
}

function addDesk(g, x, y0, z, rotY, wood) {
  const s = new THREE.Group();
  s.add(box(1.4, 0.07, 0.65, wood, 0, 0.78, 0));
  s.add(box(0.06, 0.72, 0.06, wood, -0.6, 0.36, -0.25));
  s.add(box(0.06, 0.72, 0.06, wood, 0.6, 0.36, -0.25));
  s.add(box(0.06, 0.72, 0.06, wood, -0.6, 0.36, 0.25));
  s.add(box(0.06, 0.72, 0.06, wood, 0.6, 0.36, 0.25));
  s.add(box(0.4, 0.45, 0.5, wood, 0.45, 0.35, 0));
  s.add(box(0.35, 0.28, 0.22, mat(0x1e293b), -0.25, 0.95, -0.05));
  s.add(box(0.32, 0.2, 0.02, mat(0x38bdf8, { emissive: 0x0ea5e9, emissiveIntensity: 0.2 }), -0.25, 0.95, 0.07));
  s.position.set(x, y0, z);
  s.rotation.y = rotY || 0;
  g.add(s);
}

function addKitchen(g, x0, y0, z0, mats) {
  const { cabinet, counter, steel, black } = mats;
  // L 形橱柜
  g.add(box(3.2, 0.9, 0.6, cabinet, x0, y0 + 0.5, z0));
  g.add(box(3.2, 0.06, 0.62, counter, x0, y0 + 0.98, z0));
  g.add(box(0.6, 0.9, 2.0, cabinet, x0 + 1.3, y0 + 0.5, z0 - 0.7));
  g.add(box(0.62, 0.06, 2.0, counter, x0 + 1.3, y0 + 0.98, z0 - 0.7));
  // 水槽
  g.add(box(0.55, 0.12, 0.4, steel, x0 - 0.7, y0 + 1.02, z0));
  g.add(cyl(0.02, 0.02, 0.28, steel, x0 - 0.7, y0 + 1.2, z0 - 0.05, 8));
  g.add(box(0.12, 0.04, 0.04, steel, x0 - 0.7, y0 + 1.34, z0));
  // 灶台
  g.add(box(0.7, 0.05, 0.45, black, x0 + 0.6, y0 + 1.02, z0));
  g.add(cyl(0.08, 0.08, 0.03, steel, x0 + 0.4, y0 + 1.06, z0, 10));
  g.add(cyl(0.08, 0.08, 0.03, steel, x0 + 0.8, y0 + 1.06, z0, 10));
  // 油烟机
  g.add(box(0.85, 0.35, 0.4, steel, x0 + 0.6, y0 + 2.0, z0 - 0.05));
  g.add(box(0.25, 0.7, 0.25, steel, x0 + 0.6, y0 + 2.5, z0 - 0.05));
  // 冰箱
  g.add(box(0.7, 1.9, 0.65, steel, x0 - 1.7, y0 + 1.0, z0 - 0.9));
  g.add(box(0.02, 0.7, 0.04, black, x0 - 1.38, y0 + 1.35, z0 - 0.9));
  g.add(box(0.02, 0.5, 0.04, black, x0 - 1.38, y0 + 0.55, z0 - 0.9));
  // 吊柜
  g.add(box(2.4, 0.7, 0.35, cabinet, x0 - 0.2, y0 + 2.35, z0 - 0.12));
}

function addBathroom(g, x0, y0, z0, mats) {
  const { tile, white, chrome, ceramic } = mats;
  g.add(box(2.6, 0.04, 2.4, tile, x0, y0 + 0.03, z0));
  // 马桶
  g.add(box(0.4, 0.4, 0.55, ceramic, x0 + 0.75, y0 + 0.25, z0 + 0.55));
  g.add(box(0.38, 0.35, 0.2, ceramic, x0 + 0.75, y0 + 0.55, z0 + 0.75));
  g.add(cyl(0.16, 0.18, 0.12, ceramic, x0 + 0.75, y0 + 0.48, z0 + 0.45, 12));
  // 洗手台
  g.add(box(0.9, 0.7, 0.45, white, x0 - 0.55, y0 + 0.4, z0 + 0.7));
  g.add(cyl(0.16, 0.14, 0.1, ceramic, x0 - 0.55, y0 + 0.8, z0 + 0.7, 12));
  g.add(cyl(0.015, 0.015, 0.22, chrome, x0 - 0.55, y0 + 0.95, z0 + 0.55, 6));
  // 淋浴区
  g.add(box(0.04, 2.0, 1.1, mat(0xa8d4ef, { roughness: 0.15, transparent: true, opacity: 0.35 }), x0 + 0.15, y0 + 1.1, z0 - 0.55));
  g.add(box(1.0, 0.05, 1.0, tile, x0 - 0.55, y0 + 0.04, z0 - 0.55));
  g.add(cyl(0.03, 0.03, 1.6, chrome, x0 - 0.85, y0 + 0.9, z0 - 0.85, 6));
  g.add(cyl(0.1, 0.08, 0.06, chrome, x0 - 0.7, y0 + 1.75, z0 - 0.7, 10));
  // 镜柜
  g.add(box(0.7, 0.55, 0.12, white, x0 - 0.55, y0 + 1.55, z0 + 0.95));
  g.add(box(0.55, 0.4, 0.02, mat(0xcbd5e1, { metalness: 0.4, roughness: 0.2 }), x0 - 0.55, y0 + 1.55, z0 + 1.0));
}

function addCeilingLight(g, x, y, z, warm) {
  g.add(cyl(0.22, 0.28, 0.06, mat(0xf8fafc), x, y, z, 16));
  g.add(
    cyl(0.18, 0.18, 0.04, mat(warm, { emissive: warm, emissiveIntensity: 0.45 }), x, y - 0.04, z, 16)
  );
}

function addRug(g, x, y0, z, w, d, color) {
  g.add(box(w, 0.03, d, mat(color, { roughness: 0.95 }), x, y0 + 0.02, z));
  g.add(box(w - 0.15, 0.01, d - 0.15, mat(0xf8fafc, { roughness: 0.9 }), x, y0 + 0.04, z));
}

function addPlant(g, x, y0, z) {
  g.add(cyl(0.12, 0.1, 0.28, mat(0xb45309, { roughness: 0.8 }), x, y0 + 0.2, z, 10));
  g.add(cyl(0.02, 0.04, 0.55, mat(0x3f7d2a), x, y0 + 0.55, z, 6));
  g.add(cyl(0.28, 0.05, 0.35, mat(0x4ade80, { roughness: 0.75 }), x, y0 + 0.95, z, 8));
}

/**
 * 精装三室一厅平面（单层核心户型）：
 *
 *   Z-
 *  +--------+--------+--------+
 *  | 主卧   | 次卧1  | 次卧2  |
 *  +--------+---+----+--------+
 *  |            |卫  |        |
 *  |   客 厅    +----+  厨房  |
 *  |            |餐  |        |
 *  +------------+----+--------+
 *   Z+
 */
function buildApartmentFloor(g, y0, wallH, showAllBedrooms = true) {
  const W = 16.2;
  const D = 11.6;
  const halfW = W / 2;
  const halfD = D / 2;

  const wall = mat(0xf3f0ea, { roughness: 0.92 });
  const wallAccent = mat(0xe8eef6, { roughness: 0.9 });
  const floorWood = mat(0xc4a574, { roughness: 0.72 });
  const floorLiving = mat(0xb8956a, { roughness: 0.7 });
  const floorTile = mat(0xd6d3d1, { roughness: 0.55, metalness: 0.05 });
  const floorBath = mat(0xcbd5e1, { roughness: 0.45 });
  const trim = mat(0x8b7355, { roughness: 0.55 });
  const wood = mat(0x8b5a2b, { roughness: 0.5 });
  const woodLight = mat(0xc4a484, { roughness: 0.55 });
  const fabric = mat(0x64748b, { roughness: 0.85 });
  const fabricWarm = mat(0x78716c, { roughness: 0.85 });
  const sheet = mat(0xe2e8f0, { roughness: 0.9 });
  const pillow = mat(0xf8fafc, { roughness: 0.88 });
  const duvet = mat(0x94a3b8, { roughness: 0.9 });
  const glass = mat(0xa8d4ef, {
    roughness: 0.15,
    metalness: 0.08,
    transparent: true,
    opacity: 0.4,
  });
  const frame = mat(0xf8fafc, { roughness: 0.6 });
  const black = mat(0x1e293b, { roughness: 0.4, metalness: 0.25 });
  const cabinet = mat(0xf5f0e8, { roughness: 0.7 });
  const counter = mat(0x57534e, { roughness: 0.45, metalness: 0.15 });
  const steel = mat(0xcbd5e1, { roughness: 0.3, metalness: 0.65 });

  // —— 外墙：按窗洞 / 阳台门 / 入户门分段，避免实墙挡住窗户 ——
  const winW = 1.9;
  const winH = 1.45;
  const sill = 0.9;
  // 北墙（卧室窗）：三段窗洞
  const nWins = [-5.3, -0.4, 4.6];
  const nSegs = [];
  let nx = -halfW;
  for (const cx of nWins) {
    nSegs.push({ x0: nx, x1: cx - winW / 2 });
    nx = cx + winW / 2;
  }
  nSegs.push({ x0: nx, x1: halfW });
  addNorthSouthWallSegments(g, -halfD, y0, wallH, halfW, nSegs, wall);
  for (const cx of nWins) {
    addWindowInWall(g, {
      axis: "z",
      wallPos: -halfD,
      center: cx,
      y0,
      wallH,
      winW,
      winH,
      sill,
      wallMat: wall,
      frame,
      glass,
    });
  }

  // 南墙：入户门洞
  const doorW = 1.05;
  const doorX = -1.5;
  addNorthSouthWallSegments(
    g,
    halfD,
    y0,
    wallH,
    halfW,
    [
      { x0: -halfW, x1: doorX - doorW / 2 },
      { x0: doorX + doorW / 2, x1: halfW },
    ],
    wall
  );
  addDoorOpening(g, doorX, y0, halfD, wallH, "z", wall);
  g.add(box(0.9, 0.08, 0.35, mat(0x44403c), doorX, y0 + 0.05, halfD - 0.35));

  // 西墙：客厅通往阳台的推拉门 + 主卧小窗
  const balDoorW = 2.2;
  const balDoorZ = 2.8;
  const mWinZ = -3.3;
  const mWinW = 1.6;
  addEastWestWallSegments(
    g,
    -halfW,
    y0,
    wallH,
    [
      { z0: -halfD, z1: mWinZ - mWinW / 2 },
      { z0: mWinZ + mWinW / 2, z1: balDoorZ - balDoorW / 2 },
      { z0: balDoorZ + balDoorW / 2, z1: halfD },
    ],
    wall
  );
  addWindowInWall(g, {
    axis: "x",
    wallPos: -halfW,
    center: mWinZ,
    y0,
    wallH,
    winW: mWinW,
    winH,
    sill,
    wallMat: wall,
    frame,
    glass,
  });
  // 阳台推拉门（落地）
  g.add(box(0.1, wallH - 2.2, balDoorW + 0.15, wall, -halfW, y0 + 2.2 + (wallH - 2.2) / 2, balDoorZ));
  g.add(box(0.05, 2.15, 1.0, glass, -halfW + 0.04, y0 + 1.1, balDoorZ - 0.5));
  g.add(box(0.05, 2.15, 1.0, glass, -halfW + 0.04, y0 + 1.1, balDoorZ + 0.5));
  g.add(box(0.06, 2.2, 0.06, frame, -halfW + 0.04, y0 + 1.1, balDoorZ));
  g.add(box(0.08, 0.06, balDoorW, frame, -halfW + 0.04, y0 + 2.2, balDoorZ));

  // 东墙：厨房窗
  const kWinZ = 3.2;
  const kWinW = 1.8;
  addEastWestWallSegments(
    g,
    halfW,
    y0,
    wallH,
    [
      { z0: -halfD, z1: kWinZ - kWinW / 2 },
      { z0: kWinZ + kWinW / 2, z1: halfD },
    ],
    wall
  );
  addWindowInWall(g, {
    axis: "x",
    wallPos: halfW,
    center: kWinZ,
    y0,
    wallH,
    winW: kWinW,
    winH: 1.2,
    sill: 1.05,
    wallMat: wall,
    frame,
    glass,
  });

  // 西侧阳台
  addBalcony(g, y0, wallH, {
    tile: mat(0xd6d3d1, { roughness: 0.65 }),
    rail: mat(0x64748b, { metalness: 0.45, roughness: 0.4 }),
    glass: mat(0xbfdbfe, { roughness: 0.12, transparent: true, opacity: 0.35 }),
    wood: woodLight,
  });

  // 分区地板
  g.add(box(9.2, 0.06, 5.6, floorLiving, -2.2, y0 + 0.03, 2.6));
  g.add(box(5.2, 0.06, 4.6, floorWood, -5.3, y0 + 0.03, -3.3));
  g.add(box(4.4, 0.06, 4.6, floorWood, -0.4, y0 + 0.03, -3.3));
  g.add(box(4.6, 0.06, 4.6, floorWood, 4.6, y0 + 0.03, -3.3));
  g.add(box(4.6, 0.06, 5.0, floorTile, 5.6, y0 + 0.03, 2.9));
  g.add(box(2.8, 0.06, 2.6, floorBath, 2.6, y0 + 0.03, 0.2));

  // —— 内墙 ——
  const bedWallZ = -1.0;
  g.add(box(1.8, wallH, 0.12, wall, -6.9, y0 + wallH / 2, bedWallZ));
  addDoorOpening(g, -5.3, y0, bedWallZ, wallH, "z", wall);
  g.add(box(1.5, wallH, 0.12, wall, -3.9, y0 + wallH / 2, bedWallZ));
  addDoorOpening(g, -0.4, y0, bedWallZ, wallH, "z", wall);
  g.add(box(1.6, wallH, 0.12, wall, 1.1, y0 + wallH / 2, bedWallZ));
  addDoorOpening(g, 3.6, y0, bedWallZ, wallH, "z", wall);
  g.add(box(2.4, wallH, 0.12, wall, 5.8, y0 + wallH / 2, bedWallZ));

  g.add(box(0.12, wallH, 4.5, wall, -2.7, y0 + wallH / 2, -3.3));
  g.add(box(0.12, wallH, 4.5, wall, 1.9, y0 + wallH / 2, -3.3));

  g.add(box(0.12, wallH, 2.4, wall, 3.2, y0 + wallH / 2, -0.05));
  g.add(box(0.12, wallH, 1.6, wall, 3.2, y0 + wallH / 2, 4.2));
  g.add(box(0.7, wallH, 0.12, wall, 1.55, y0 + wallH / 2, 1.4));
  addDoorOpening(g, 2.4, y0, 1.4, wallH, "z", wall);
  g.add(box(0.7, wallH, 0.12, wall, 3.35, y0 + wallH / 2, 1.4));
  g.add(box(0.12, wallH, 2.5, wall, 1.3, y0 + wallH / 2, 0.15));

  g.add(box(0.12, 1.1, 2.2, wallAccent, 3.2, y0 + 0.6, 2.5));

  // —— 客厅布置 ——
  addRug(g, -2.0, y0, 2.8, 3.2, 2.4, 0x7c2d12);
  addSofa(g, -2.0, y0, 4.35, Math.PI, fabric, wood);
  addArmchair(g, -4.3, y0, 3.0, Math.PI / 2, fabricWarm, wood);
  addArmchair(g, 0.3, y0, 3.0, -Math.PI / 2, fabricWarm, wood);
  addCoffeeTable(g, -2.0, y0, 2.9, woodLight, glass);
  addTvUnit(g, -2.0, y0, 0.55, wood, black);
  addPlant(g, -4.6, y0, 4.6);
  addPlant(g, 0.6, y0, 4.7);
  addCeilingLight(g, -2.0, y0 + wallH - 0.12, 2.6, 0xffe4a8);
  // 鞋柜
  g.add(box(1.2, 1.1, 0.35, woodLight, 0.2, y0 + 0.6, 5.2));
  // 装饰画
  g.add(box(1.1, 0.7, 0.04, mat(0x1d4ed8), -4.5, y0 + 1.8, 0.55));
  g.add(box(0.9, 0.6, 0.03, mat(0xf59e0b), -3.3, y0 + 1.75, 0.55));

  // —— 餐厅 ——
  addDiningSet(g, 0.9, y0, 2.0, woodLight, fabric);
  addCeilingLight(g, 0.9, y0 + wallH - 0.12, 2.0, 0xffe4a8);

  // —— 厨房 ——
  addKitchen(g, 5.5, y0, 4.2, { cabinet, counter, steel, black });
  addCeilingLight(g, 5.5, y0 + wallH - 0.12, 3.2, 0xf8fafc);

  // —— 卫生间 ——
  addBathroom(g, 2.6, y0, 0.15, {
    tile: floorBath,
    white: mat(0xf8fafc),
    chrome: steel,
    ceramic: mat(0xf1f5f9, { roughness: 0.35 }),
  });
  addCeilingLight(g, 2.6, y0 + wallH - 0.12, 0.15, 0xf8fafc);

  // —— 主卧 ——
  addBed(g, -5.5, y0, -3.6, 0, true, { wood, sheet, pillow, duvet: mat(0x64748b, { roughness: 0.88 }) });
  addNightstand(g, -6.7, y0, -4.5, wood);
  addNightstand(g, -4.3, y0, -4.5, wood);
  addWardrobe(g, -3.5, y0, -2.0, -Math.PI / 2, wood);
  addDesk(g, -6.8, y0, -2.0, Math.PI / 2, woodLight);
  addRug(g, -5.5, y0, -2.6, 1.6, 1.0, 0x44403c);
  addCeilingLight(g, -5.3, y0 + wallH - 0.12, -3.3, 0xffe4a8);
  addPlant(g, -3.5, y0, -4.8);

  if (showAllBedrooms) {
    // —— 次卧1 ——
    addBed(g, -0.5, y0, -3.8, 0, false, { wood, sheet, pillow, duvet: mat(0x38bdf8, { roughness: 0.88 }) });
    addNightstand(g, -1.4, y0, -4.7, woodLight);
    addWardrobe(g, 1.1, y0, -2.0, Math.PI, woodLight);
    addDesk(g, 0.8, y0, -4.6, 0, wood);
    addCeilingLight(g, -0.4, y0 + wallH - 0.12, -3.3, 0xffe4a8);

    // —— 次卧2 ——
    addBed(g, 4.8, y0, -3.8, 0, false, { wood, sheet, pillow, duvet: mat(0xf472b6, { roughness: 0.88 }) });
    addNightstand(g, 5.8, y0, -4.7, woodLight);
    addWardrobe(g, 6.5, y0, -2.0, Math.PI, wood);
    addArmchair(g, 3.5, y0, -2.3, Math.PI / 4, fabric, wood);
    addCeilingLight(g, 4.6, y0 + wallH - 0.12, -3.3, 0xffe4a8);
  }

  // 踢脚线
  addBaseboard(g, -halfW + 0.2, -halfD + 0.2, halfW - 0.2, -halfD + 0.2, y0, trim);
  addBaseboard(g, -halfW + 0.2, halfD - 0.2, halfW - 0.2, halfD - 0.2, y0, trim);

  // 仅做吊顶边梁，不盖实心天花，方便俯视看清各房间
  const beam = mat(0xe7e5e4, { roughness: 0.85 });
  g.add(box(W - 0.3, 0.1, 0.16, beam, 0, y0 + wallH - 0.05, -halfD + 0.2));
  g.add(box(W - 0.3, 0.1, 0.16, beam, 0, y0 + wallH - 0.05, halfD - 0.2));
  g.add(box(0.16, 0.1, D - 0.3, beam, -halfW + 0.2, y0 + wallH - 0.05, 0));
  g.add(box(0.16, 0.1, D - 0.3, beam, halfW - 0.2, y0 + wallH - 0.05, 0));

  return { W, D, wallH };
}

/** 室内各空间镜头：供左侧点击单独查看 */
export const ROOM_FOCUS_PRESETS = [
  {
    id: "overview",
    label: "全屋俯视",
    target: [0, 0.2, 0.5],
    pos: [0, 18, 0.2],
  },
  {
    id: "living",
    label: "客厅",
    target: [-2.0, 1.1, 2.8],
    pos: [-2.0, 2.0, 7.2],
  },
  {
    id: "dining",
    label: "餐厅",
    target: [0.9, 1.0, 2.0],
    pos: [0.9, 2.1, 5.2],
  },
  {
    id: "master",
    label: "主卧",
    target: [-5.3, 1.0, -3.3],
    pos: [-5.3, 2.0, 0.8],
  },
  {
    id: "bed1",
    label: "次卧1",
    target: [-0.4, 1.0, -3.3],
    pos: [-0.4, 2.0, 0.8],
  },
  {
    id: "bed2",
    label: "次卧2",
    target: [4.6, 1.0, -3.3],
    pos: [4.6, 2.0, 0.8],
  },
  {
    id: "kitchen",
    label: "厨房",
    target: [5.5, 1.1, 3.2],
    pos: [2.8, 2.1, 3.2],
  },
  {
    id: "bath",
    label: "卫生间",
    target: [2.6, 1.0, 0.15],
    pos: [2.6, 2.0, 2.6],
  },
  {
    id: "balcony",
    label: "阳台",
    target: [-10.0, 1.0, 2.8],
    pos: [-13.5, 2.4, 2.8],
  },
];

function buildRoom(cfg) {
  const g = new THREE.Group();
  g.name = "env_room";
  const bedrooms = Math.max(1, Math.min(6, Number(cfg.bedrooms) || 3));
  const floors = Math.max(1, Math.min(5, Number(cfg.floors) || 1));
  const hasBasement = !!cfg.has_basement;
  const wallH = 2.85;
  const showAllBedrooms = bedrooms >= 3;

  // 地下室
  if (hasBasement) {
    const baseY = -wallH;
    const W = 16.2;
    const D = 11.6;
    g.add(box(W, 0.2, D, mat(0x6b7280, { roughness: 0.85 }), 0, baseY - 0.05, 0));
    g.add(box(W, wallH, 0.2, mat(0x4b5563), 0, baseY + wallH / 2, -D / 2));
    g.add(box(0.2, wallH, D, mat(0x4b5563), -W / 2, baseY + wallH / 2, 0));
    g.add(box(0.2, wallH, D, mat(0x4b5563), W / 2, baseY + wallH / 2, 0));
    g.add(box(W, wallH, 0.2, mat(0x4b5563), 0, baseY + wallH / 2, D / 2));
    g.add(cyl(0.22, 0.22, wallH - 0.3, mat(0x9ca3af), -3, baseY + wallH / 2, 0, 10));
    g.add(cyl(0.22, 0.22, wallH - 0.3, mat(0x9ca3af), 3, baseY + wallH / 2, 0, 10));
    g.add(box(2.4, 0.7, 1.2, mat(0x78716c), 0, baseY + 0.4, 2));
    g.add(box(1.6, 1.8, 0.6, mat(0x57534e), -4, baseY + 0.95, -2));
  }

  for (let f = 0; f < floors; f++) {
    const y0 = f * wallH;
    // 楼板底板
    g.add(box(16.4, 0.16, 11.8, mat(0xa8a29e, { roughness: 0.85 }), 0, y0 - 0.08, 0));
    buildApartmentFloor(g, y0, wallH, showAllBedrooms || f === 0);

    // 多层楼梯（靠入户旁）
    if (floors > 1 && f < floors - 1) {
      const trim = mat(0x8b7355, { roughness: 0.55 });
      for (let s = 0; s < 8; s++) {
        g.add(box(1.1, 0.1, 0.38, trim, 1.2, y0 + 0.12 + s * 0.34, 5.0 - s * 0.32));
      }
      g.add(box(0.06, wallH * 0.85, 0.06, trim, 0.6, y0 + wallH * 0.4, 4.2));
      g.add(box(0.06, wallH * 0.85, 0.06, trim, 1.8, y0 + wallH * 0.4, 4.2));
    }
  }

  return g;
}

function plantCrop(g, crop, x, y, z) {
  const leaf = mat(crop.leaf, { roughness: 0.8 });
  const fruit = mat(crop.color, { roughness: 0.55 });
  const h = crop.height || 0.7;
  g.add(cyl(0.04, 0.06, h, leaf, x, y + h / 2, z, 6));
  if (h > 0.5) {
    g.add(cyl(0.12, 0.02, 0.25, leaf, x, y + h * 0.75, z, 6));
  }
  g.add(cyl(0.1, 0.1, 0.18, fruit, x, y + h * 0.55, z + 0.12, 8));
}

function buildGreenhouse(cfg) {
  const g = new THREE.Group();
  g.name = "env_greenhouse";
  const crop = cropMeta(CROP_OPTIONS, cfg.crop);

  g.add(box(22, 0.25, 16, mat(0x6b542e, { roughness: 0.9 }), 0, -0.12, 0));
  for (let i = -2; i <= 2; i++) {
    g.add(box(18, 0.35, 1.6, mat(0x4a3728, { roughness: 0.95 }), 0, 0.15, i * 2.6));
    for (let j = -4; j <= 4; j++) {
      plantCrop(g, crop, j * 1.8, 0.35, i * 2.6);
    }
  }
  const pipe = mat(0xb8c4c0, { metalness: 0.55, roughness: 0.35 });
  const film = mat(0xd7f0e4, { roughness: 0.3, transparent: true, opacity: 0.28 });
  for (let x = -8; x <= 8; x += 2) {
    g.add(cyl(0.08, 0.08, 4.2, pipe, x, 2.1, -7));
    g.add(cyl(0.08, 0.08, 4.2, pipe, x, 2.1, 7));
  }
  for (let z = -7; z <= 7; z += 2) {
    g.add(box(18, 0.1, 0.1, pipe, 0, 4.2, z));
  }
  g.add(box(18.5, 0.08, 15, film, 0, 4.35, 0));
  g.add(box(0.08, 4.2, 15, film, -9.1, 2.1, 0));
  g.add(box(0.08, 4.2, 15, film, 9.1, 2.1, 0));

  // 作物名牌示意（矮牌）
  g.add(box(1.8, 0.7, 0.08, mat(0xf8fafc), -8.5, 1.2, 0));
  return g;
}

function buildFarm(cfg) {
  const g = new THREE.Group();
  g.name = "env_farm";
  const crop = cropMeta(FARM_CROP_OPTIONS, cfg.crop);

  g.add(box(32, 0.3, 24, mat(0x6a8f3d, { roughness: 0.92 }), 0, -0.15, 0));
  for (let row = -2; row <= 2; row++) {
    g.add(box(12, 0.2, 3.2, mat(0x5c4030, { roughness: 0.95 }), -7, 0.05, row * 4));
    g.add(box(12, 0.2, 3.2, mat(0x5c4030, { roughness: 0.95 }), 7, 0.05, row * 4));
    for (let k = -5; k <= 5; k++) {
      const h = (crop.height || 0.9) + (k % 3) * 0.08;
      // 左田
      g.add(cyl(0.12, 0.18, h, mat(crop.leaf), -7 + k * 1.0, h / 2 + 0.15, row * 4, 6));
      if (crop.id === "fruit_trees") {
        g.add(cyl(0.55, 0.05, 0.7, mat(crop.leaf), -7 + k * 1.0, h + 0.2, row * 4, 8));
        g.add(cyl(0.08, 0.08, 0.15, mat(crop.color), -7 + k * 1.0 + 0.25, h + 0.15, row * 4, 6));
      } else if (crop.id !== "wheat") {
        g.add(cyl(0.1, 0.1, 0.16, mat(crop.color), -7 + k * 1.0, h * 0.7, row * 4 + 0.15, 6));
      } else {
        g.add(cyl(0.08, 0.02, 0.25, mat(crop.color), -7 + k * 1.0, h + 0.05, row * 4, 5));
      }
      // 右田
      g.add(cyl(0.12, 0.18, h * 0.95, mat(crop.leaf), 7 + k * 1.0, h / 2 + 0.12, row * 4, 6));
    }
  }
  const wood = mat(0x8b6914, { roughness: 0.7 });
  for (let x = -14; x <= 14; x += 2) {
    g.add(cyl(0.08, 0.1, 1.4, wood, x, 0.7, -11));
    g.add(cyl(0.08, 0.1, 1.4, wood, x, 0.7, 11));
  }
  g.add(box(28, 0.08, 0.08, wood, 0, 1.1, -11));
  g.add(box(28, 0.08, 0.08, wood, 0, 1.1, 11));
  g.add(box(2.2, 0.08, 22, mat(0xb89b6a, { roughness: 0.9 }), 0, 0.02, 0));
  return g;
}

function buildRicePaddy(cfg) {
  const g = new THREE.Group();
  g.name = "env_rice";
  const hasCanal = cfg.has_canal !== false;

  // 外埂
  g.add(box(28, 0.55, 20, mat(0x6b4f2e, { roughness: 0.9 }), 0, 0.1, 0));
  const water = mat(0x4a9bb8, {
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.55,
  });
  g.add(box(22, 0.2, 14, water, 0, 0.22, 0));
  const ridge = mat(0x7a5a38, { roughness: 0.85 });
  g.add(box(22, 0.45, 0.7, ridge, 0, 0.35, 0));
  g.add(box(0.7, 0.45, 14, ridge, 0, 0.35, 0));

  // 稻丛
  const rice = mat(0x5fa84a, { roughness: 0.75 });
  for (let x = -9; x <= 9; x += 1.5) {
    for (let z = -5.5; z <= 5.5; z += 1.5) {
      if (Math.abs(x) < 0.6 || Math.abs(z) < 0.6) continue;
      g.add(cyl(0.08, 0.14, 0.9 + ((x + z) % 3) * 0.1, rice, x, 0.75, z, 5));
    }
  }

  // 水渠：田边主渠 + 支渠
  if (hasCanal) {
    const canal = mat(0x3b82a0, {
      roughness: 0.2,
      metalness: 0.05,
      transparent: true,
      opacity: 0.65,
    });
    const bank = mat(0x8b6914, { roughness: 0.85 });
    // 北侧主渠
    g.add(box(30, 0.35, 1.6, canal, 0, 0.15, -10.2));
    g.add(box(30, 0.4, 0.35, bank, 0, 0.35, -11.1));
    g.add(box(30, 0.4, 0.35, bank, 0, 0.35, -9.3));
    // 东侧支渠接入稻田
    g.add(box(1.4, 0.3, 8, canal, 12.2, 0.18, -4));
    g.add(box(0.3, 0.35, 8, bank, 11.4, 0.35, -4));
    g.add(box(0.3, 0.35, 8, bank, 13.0, 0.35, -4));
    // 西侧回水渠
    g.add(box(1.2, 0.28, 10, canal, -12.5, 0.16, 1));
    g.add(box(0.28, 0.32, 10, bank, -13.2, 0.32, 1));
    g.add(box(0.28, 0.32, 10, bank, -11.8, 0.32, 1));
    // 水闸示意（环境装饰）
    g.add(box(0.8, 1.1, 0.25, mat(0x78716c), 12.2, 0.9, -8.2));
  }

  g.add(box(30, 0.15, 2, mat(0x9a8260, { roughness: 0.9 }), 0, 0.35, 10.5));
  return g;
}
