import { onBeforeUnmount, reactive, shallowRef } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  buildLayoutFromAnnotations,
  cropViewToCanvas,
} from "./assembleFromAnnotations";
import { layerOfProp } from "./buildGrid";
import { attachViewPlanes, createTwinWorld } from "./createStreetLightScene";
import { deepCloneModel, resolveModel } from "./loadModel";
import { labelsMap, shapesMap } from "./partCatalog";
import { resolveIndoorPlace } from "./indoorSnap";
import { GRID_SNAP, snapToGrid } from "./placeCatalog";
import { paintRoadCells } from "./buildGrid";
import {
  getSceneType,
  resolveEnvId,
  setCustomSceneTypeCache,
} from "./sceneTypes";
import { isUtilityKind } from "./utilityNetwork";

const DEFAULT_LAYERS = {
  assembly: true,
  building: true,
  decoration: true,
  road: true,
  circuit: false, // 默认隐藏；铺电路时再显示
  water: true,
  device: true,
};

const LAYER_KEYS = new Set(Object.keys(DEFAULT_LAYERS));

function isPaintNetworkKind(kind) {
  return kind === "road" || isUtilityKind(kind);
}

export function useTwinViewer() {
  const selectedPartId = shallowRef(null);
  const selectedPropId = shallowRef(null);
  const placeBrush = shallowRef(null);
  const buildMode = shallowRef(false); // 放置模式
  const bulldozeMode = shallowRef(false); // 推土机
  const fogEnabled = shallowRef(false);
  const layers = reactive({ ...DEFAULT_LAYERS });

  let onPlaceCallback = null;
  let onDeletePropCallback = null;
  let onPaintCallback = null; // 拖拽铺路批量放置
  let onPlacePathCallback = null; // 点到点铺路
  let onMovePropCallback = null;
  let onBulldozeEndCallback = null;
  /** @type {{ x: number, z: number } | null} */
  let paintAnchor = null;
  let pathPreviewGroup = null;
  /** @type {Record<string, THREE.Object3D>} */
  let propRootsById = {};
  /** @type {Record<string, { marker: THREE.Mesh, mats: THREE.Material[], blink: boolean, baseColor: number }>} */
  let deviceStatusFx = {};
  let renderer;
  let scene;
  let camera;
  let controls;
  let world;
  let raf = 0;
  let canvasEl;
  let raycaster;
  let pointer;
  let viewPlanes;
  let resizeObs;
  let groundPlane;
  let pointerDownPos = null;
  let painting = false;
  let lastPaintKey = "";
  let bulldozing = false;
  let lastBulldozeId = "";
  const bulldozedIds = new Set();
  let ghostRoot = null;
  let applyPropsGen = 0;
  let applyPropsQueue = Promise.resolve();
  let ghostModelKey = "";
  let outlineHelper = null;
  let hemiLight = null;
  let sunLight = null;
  let sunSystem = null; // { group, sunMesh, pathLine }
  let lastSimHour = 12;
  const SUN_RADIUS = 42;
  let currentViews = {};
  let currentSceneType = "street";
  let currentSceneConfig = {};
  let customSceneTypes = [];
  let propMetaById = {};
  let placeGridHelper = null;
  let draggingPropId = null;
  let dragMoved = false;
  let controlsWasEnabled = true;
  const heldKeys = new Set();
  let lastCamTick = 0;
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _move = new THREE.Vector3();
  const _offset = new THREE.Vector3();
  const _spherical = new THREE.Spherical();
  const _up = new THREE.Vector3(0, 1, 0);

  function sceneMeta(typeId = currentSceneType) {
    return getSceneType(typeId, customSceneTypes);
  }

  function envIdOf(typeId = currentSceneType) {
    return resolveEnvId(typeId, customSceneTypes);
  }

  function setCustomSceneTypes(list) {
    customSceneTypes = Array.isArray(list) ? list : [];
    setCustomSceneTypeCache(customSceneTypes);
    if (scene) applySceneLook(currentSceneType);
  }

  function applySceneLook(typeId) {
    const meta = sceneMeta(typeId);
    if (!scene) return;
    const bg = meta.bg ?? 0xdde6e0;
    scene.background = new THREE.Color(bg);
    applyFog(meta);
  }

  function applyFog(meta) {
    if (!scene) return;
    const m = meta || sceneMeta();
    if (!fogEnabled.value) {
      scene.fog = null;
      return;
    }
    const fogColor = m.fog ?? m.bg ?? 0xdde6e0;
    scene.fog = new THREE.Fog(fogColor, 28, 90);
  }

  function setFogEnabled(on) {
    fogEnabled.value = !!on;
    applyFog();
  }

  function init(canvas, opts = {}) {
    dispose();
    canvasEl = canvas;
    currentViews = opts.views || {};
    currentSceneType = opts.sceneType || "street";
    currentSceneConfig = { ...(opts.sceneConfig || {}) };
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 420;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    applySceneLook(currentSceneType);

    camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
    camera.position.set(14, 16, 18);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minPolarAngle = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 120;
    controls.screenSpacePanning = false;
    controls.enablePan = true;
    controls.panSpeed = 1.1;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 1.15;

    hemiLight = new THREE.HemisphereLight(0xf5f7f4, 0x6b7c73, 0.95);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xfff6e5, 1.15);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.00035;
    sunLight.shadow.normalBias = 0.02;
    const sc = sunLight.shadow.camera;
    sc.near = 2;
    sc.far = 140;
    sc.left = -48;
    sc.right = 48;
    sc.top = 48;
    sc.bottom = -48;
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLight.target.position.set(0, 0, 0);

    buildSunSystem();
    ensureShadowCatcher();

    world = createTwinWorld(currentSceneType, currentSceneConfig);
    scene.add(world.root);
    ensurePlaceGrid(buildMode.value || envIdOf() === "blank");
    setDayNight(lastSimHour, false);

    if (opts.views) {
      const loader = new THREE.TextureLoader();
      viewPlanes = attachViewPlanes(world.root, opts.views, loader);
    }

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearHeldKeys);
    resizeObs = new ResizeObserver(() => resize());
    resizeObs.observe(canvas.parentElement || canvas);

    lastCamTick = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastCamTick) / 1000);
      lastCamTick = now;
      updateCityCamera(dt);
      // 告警状态灯闪烁
      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 0.008));
      for (const fx of Object.values(deviceStatusFx)) {
        if (!fx?.blink || !fx.marker?.material) continue;
        fx.marker.material.opacity = pulse;
        fx.marker.material.emissiveIntensity = 0.4 + pulse * 0.8;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
  }

  function resize() {
    if (!renderer || !camera || !canvasEl) return;
    const w = canvasEl.clientWidth || 1;
    const h = canvasEl.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function setPointerFromEvent(ev) {
    const rect = canvasEl.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function hitGround(ev) {
    setPointerFromEvent(ev);
    const target = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(groundPlane, target);
    return ok ? target : null;
  }

  /** 放置预览：透明度 60% → opacity 0.4 */
  const GHOST_OPACITY = 0.4;

  function makeGhostTransparent(root) {
    root.traverse((c) => {
      if (!c.isMesh || !c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      const mapped = mats.map((m) => {
        const nm = m.clone();
        nm.transparent = true;
        nm.opacity = GHOST_OPACITY;
        nm.depthWrite = false;
        if ("metalness" in nm) nm.metalness = Math.min(nm.metalness ?? 0, 0.2);
        return nm;
      });
      c.material = mapped.length === 1 ? mapped[0] : mapped;
      c.castShadow = false;
      c.receiveShadow = false;
      c.visible = true;
    });
    root.visible = true;
  }

  async function ensureGhost(brush) {
    const key = brush ? `${brush.model?.kind}:${brush.model?.id || brush.model?.url}` : "";
    if (!brush) {
      clearGhost();
      return;
    }
    if (ghostRoot && ghostModelKey === key) return;
    clearGhost();
    try {
      const root = await resolveModel(brush.model, { partId: brush.assetId });
      if (!root) return;
      makeGhostTransparent(root);
      // GLB 已在 resolveModel 里按 fit 缩放过，勿 setScalar 冲掉
      if (brush.source === "device") root.scale.multiplyScalar(1.6);
      ghostRoot = root;
      ghostModelKey = key;
      scene.add(ghostRoot);
    } catch {
      ghostRoot = null;
    }
  }

  function clearGhost() {
    if (ghostRoot && scene) {
      scene.remove(ghostRoot);
      ghostRoot.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose?.());
        }
      });
    }
    ghostRoot = null;
    ghostModelKey = "";
  }

  function clearPathPreview() {
    if (pathPreviewGroup && scene) {
      scene.remove(pathPreviewGroup);
      pathPreviewGroup.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose?.());
        }
      });
    }
    pathPreviewGroup = null;
  }

  function clearPaintAnchor() {
    paintAnchor = null;
    clearPathPreview();
  }

  async function updatePathPreview(endPt, brush) {
    if (!scene || !paintAnchor || !brush || !endPt) {
      clearPathPreview();
      return;
    }
    const snap = resolveSnapForBrush(brush);
    const cells = paintRoadCells(paintAnchor.x, paintAnchor.z, endPt.x, endPt.z, snap);
    clearPathPreview();
    if (!cells.length) return;
    try {
      const tpl = await resolveModel(brush.model, { partId: brush.assetId });
      if (!tpl) return;
      const group = new THREE.Group();
      group.name = "pathPreview";
      for (const c of cells) {
        const root = deepCloneModel(tpl);
        makeGhostTransparent(root);
        root.position.set(c.x, 0.04, c.z);
        root.scale.multiplyScalar(brush.source === "device" ? 1.2 : 1);
        group.add(root);
      }
      scene.add(group);
      pathPreviewGroup = group;
    } catch {
      clearPathPreview();
    }
  }

  function resolveSnapForBrush(brush) {
    if (isUtilityKind(brush?.kind)) return 1;
    if (brush?.kind === "road") return Math.max(0.5, Number(brush.snap) || activeGridSize());
    return Math.max(0.5, Number(brush.snap) || activeGridSize());
  }

  function activeGridSize() {
    return Math.max(0.5, Number(currentSceneConfig.grid_size) || GRID_SNAP);
  }

  function snapPoint(pt, item) {
    return snapToGrid(pt.x, pt.z, item, activeGridSize());
  }

  function updateGhostAt(pt, brush) {
    if (!ghostRoot || !brush || !pt) return;
    const { x, z } = snapPoint(pt, brush);
    let y = 0.02;
    if (envIdOf() === "room" && brush.source === "device") {
      const indoor = resolveIndoorPlace(x, z);
      if (indoor) {
        ghostRoot.position.set(indoor.x, indoor.y + 0.02, indoor.z);
        ghostRoot.rotation.y = indoor.rotY || 0;
        ghostRoot.visible = true;
        return;
      }
    }
    ghostRoot.position.set(x, y, z);
    ghostRoot.rotation.y = 0;
    ghostRoot.visible = true;
  }

  function setOutline(object3d) {
    clearOutline();
    if (!object3d || !scene) return;
    outlineHelper = new THREE.BoxHelper(object3d, 0x38bdf8);
    outlineHelper.material.depthTest = false;
    outlineHelper.renderOrder = 10;
    outlineHelper.userData._target = object3d;
    scene.add(outlineHelper);
  }

  function onContextMenu(ev) {
    if (!placeBrush.value && !bulldozeMode.value) return;
    ev.preventDefault();
    clearPlaceBrush();
    if (bulldozeMode.value) setBulldozeMode(false);
  }

  function isTypingTarget(ev) {
    const tag = (ev.target && ev.target.tagName) || "";
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!ev.target?.isContentEditable;
  }

  function clearHeldKeys() {
    heldKeys.clear();
  }

  function onKeyUp(ev) {
    if (ev.key === "Shift") heldKeys.delete("shift");
    heldKeys.delete(ev.key.toLowerCase());
  }

  function onKeyDown(ev) {
    if (isTypingTarget(ev)) return;
    if (ev.key === "Escape") {
      clearPlaceBrush();
      if (bulldozeMode.value) setBulldozeMode(false);
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && selectedPropId.value && onDeletePropCallback) {
      ev.preventDefault();
      onDeletePropCallback(selectedPropId.value);
      return;
    }

    if (ev.key === "Shift") heldKeys.add("shift");
    const k = ev.key.toLowerCase();
    if (k === "b" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      setBulldozeMode(!bulldozeMode.value);
      return;
    }
    if ("wasdqertfgzx".includes(k) && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      heldKeys.add(k);
      ev.preventDefault();
    }
  }

  function syncToolCursor() {
    if (!canvasEl) return;
    if (bulldozeMode.value) canvasEl.style.cursor = "not-allowed";
    else if (placeBrush.value) canvasEl.style.cursor = "crosshair";
    else if (buildMode.value) canvasEl.style.cursor = "default";
    else canvasEl.style.cursor = "";
  }

  /** 放置 / 推土时禁用鼠标拖拽旋转视角，避免和点击操作冲突 */
  function syncOrbitForTools() {
    if (!controls) return;
    const toolActive = buildMode.value || bulldozeMode.value || !!placeBrush.value;
    controls.enableRotate = !toolActive;
  }

  function setBulldozeMode(on) {
    const next = !!on;
    bulldozeMode.value = next;
    if (next) {
      clearPlaceBrush();
      selectProp(null);
      selectPart(null);
      endDragMove(false);
    }
    bulldozing = false;
    lastBulldozeId = "";
    bulldozedIds.clear();
    syncToolCursor();
    syncOrbitForTools();
  }

  /** 天际线式：WASD 平移 · QE 旋转 · RF 升降 · TG 倾斜 · ZX 缩放 */
  function updateCityCamera(dt) {
    if (!camera || !controls || !heldKeys.size) return;

    const boost = heldKeys.has("shift") ? 2.2 : 1;
    const panSpeed = 18 * boost * dt;
    const rotSpeed = 1.35 * boost * dt;
    const elevSpeed = 10 * boost * dt;
    const tiltSpeed = 0.9 * boost * dt;
    const zoomSpeed = 22 * boost * dt;

    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, _up).normalize();

    _move.set(0, 0, 0);
    if (heldKeys.has("w")) _move.add(_fwd);
    if (heldKeys.has("s")) _move.sub(_fwd);
    if (heldKeys.has("a")) _move.sub(_right);
    if (heldKeys.has("d")) _move.add(_right);
    if (_move.lengthSq() > 0) {
      _move.normalize().multiplyScalar(panSpeed);
      camera.position.add(_move);
      controls.target.add(_move);
    }

    if (heldKeys.has("q") || heldKeys.has("e")) {
      const angle = (heldKeys.has("q") ? 1 : -1) * rotSpeed;
      _offset.copy(camera.position).sub(controls.target);
      _offset.applyAxisAngle(_up, angle);
      camera.position.copy(controls.target).add(_offset);
    }

    if (heldKeys.has("r")) {
      camera.position.y += elevSpeed;
    }
    if (heldKeys.has("f")) {
      camera.position.y = Math.max(1.2, camera.position.y - elevSpeed);
    }

    if (heldKeys.has("t") || heldKeys.has("g") || heldKeys.has("z") || heldKeys.has("x")) {
      _offset.copy(camera.position).sub(controls.target);
      _spherical.setFromVector3(_offset);
      if (heldKeys.has("t")) _spherical.phi = Math.max(0.08, _spherical.phi - tiltSpeed);
      if (heldKeys.has("g")) _spherical.phi = Math.min(Math.PI * 0.48, _spherical.phi + tiltSpeed);
      if (heldKeys.has("z")) {
        _spherical.radius = Math.max(controls.minDistance, _spherical.radius - zoomSpeed);
      }
      if (heldKeys.has("x")) {
        _spherical.radius = Math.min(controls.maxDistance, _spherical.radius + zoomSpeed);
      }
      _offset.setFromSpherical(_spherical);
      camera.position.copy(controls.target).add(_offset);
      if (buildMode.value) {
        controls.maxPolarAngle = Math.PI * 0.48;
        controls.minPolarAngle = 0.08;
      }
    }
  }

  function pickPropIdAtPointer(ev) {
    setPointerFromEvent(ev);
    const propMeshes = [];
    const propsGroup = world?.root?.getObjectByName("sceneProps");
    propsGroup?.traverse((o) => {
      if (o.isMesh && o.userData?.propId) propMeshes.push(o);
      if (o.isInstancedMesh) propMeshes.push(o);
    });
    const propHits = raycaster.intersectObjects(propMeshes, false);
    if (!propHits.length) return null;
    const hit = propHits[0];
    let pid = hit.object.userData?.propId;
    if (hit.object.isInstancedMesh && hit.instanceId != null) {
      pid = hit.object.userData.instancePropIds?.[hit.instanceId] || pid;
    }
    return pid || null;
  }

  function findPropRoot(propId) {
    const propsGroup = world?.root?.getObjectByName("sceneProps");
    if (!propsGroup || !propId) return null;
    for (const c of propsGroup.children || []) {
      if (c.userData?.propId === propId) return c;
      if (c.isInstancedMesh && c.userData?.instancePropIds?.includes(propId)) {
        return { instanced: c, propId };
      }
    }
    return null;
  }

  function previewMoveProp(propId, x, z) {
    const root = findPropRoot(propId);
    if (!root || root.instanced) return;
    root.position.x = x;
    root.position.z = z;
    if (outlineHelper?.userData?._target === root) outlineHelper.update();
  }

  function demolishAtPointer(ev) {
    const pid = pickPropIdAtPointer(ev);
    if (!pid || !onDeletePropCallback) return null;
    if (bulldozedIds.has(pid)) return pid;
    bulldozedIds.add(pid);
    lastBulldozeId = pid;
    // 先本地隐藏，避免等重建时拖过漏删
    const root = findPropRoot(pid);
    if (root && !root.instanced) root.visible = false;
    else if (root?.instanced) {
      // InstancedMesh：整批重建时再清；此处仍回调删除数据
    }
    onDeletePropCallback(pid, { paint: true });
    selectProp(null);
    return pid;
  }

  function onPointerDown(ev) {
    if (!canvasEl || !camera || !world) return;
    if (ev.button !== 0) return;
    pointerDownPos = { x: ev.clientX, y: ev.clientY };
    dragMoved = false;
    draggingPropId = null;

    // 推土机：单击或按住拖过，碰到的一律拆除
    if (bulldozeMode.value) {
      bulldozing = true;
      lastBulldozeId = "";
      bulldozedIds.clear();
      controlsWasEnabled = controls.enabled;
      controls.enabled = false;
      demolishAtPointer(ev);
      return;
    }

    // 马路 / 电路 / 水管：支持拖拽连续铺，或点到点（松手未拖动时）
    if (isPaintNetworkKind(placeBrush.value?.kind)) {
      painting = true;
      lastPaintKey = "";
      const pt = hitGround(ev);
      if (pt) {
        const { x, z } = snapPoint(pt, placeBrush.value);
        lastPaintKey = `${x},${z}`;
        // 拖拽过程中的格子在 move 里铺；此处只记起点，避免单击误铺一格
      }
      return;
    }

    // 放置模式：拖选中物体移动
    if (buildMode.value && !placeBrush.value) {
      const pid = pickPropIdAtPointer(ev);
      if (pid) {
        selectProp(pid);
        selectPart(null);
        draggingPropId = pid;
        controlsWasEnabled = controls.enabled;
        controls.enabled = false;
        if (canvasEl) canvasEl.style.cursor = "grabbing";
      }
    }
  }

  function onPointerMove(ev) {
    if (!canvasEl || !camera) return;

    if (bulldozeMode.value) {
      if (bulldozing) demolishAtPointer(ev);
      return;
    }

    if (placeBrush.value) {
      const pt = hitGround(ev);
      if (isPaintNetworkKind(placeBrush.value.kind) && paintAnchor && pt && !painting) {
        const { x, z } = snapPoint(pt, placeBrush.value);
        updateGhostAt({ x, y: 0, z }, placeBrush.value);
        void updatePathPreview({ x, z }, placeBrush.value);
      } else {
        updateGhostAt(pt, placeBrush.value);
      }
      if (painting && isPaintNetworkKind(placeBrush.value.kind) && pt && onPlaceCallback) {
        const { x, z } = snapPoint(pt, placeBrush.value);
        const key = `${x},${z}`;
        if (key !== lastPaintKey) {
          // 真正拖过格子才铺，单击留给点到点
          if (lastPaintKey) {
            if (!paintAnchor) {
              const [ax, az] = lastPaintKey.split(",").map(Number);
              onPlaceCallback({ x: ax, y: 0, z: az, brush: placeBrush.value, paint: true });
            }
            onPlaceCallback({ x, y: 0, z, brush: placeBrush.value, paint: true });
          }
          lastPaintKey = key;
        }
      }
      return;
    }

    if (draggingPropId) {
      const pt = hitGround(ev);
      if (!pt) return;
      dragMoved = true;
      const meta = propMetaById[draggingPropId] || {};
      const { x, z } = snapPoint(pt, meta);
      previewMoveProp(draggingPropId, x, z);
    }
  }

  function onPointerUp(ev) {
    if (!canvasEl || !camera || !world) return;
    if (ev.button !== 0 || !pointerDownPos) {
      painting = false;
      if (bulldozing) {
        bulldozing = false;
        if (controls) controls.enabled = controlsWasEnabled;
        onBulldozeEndCallback?.();
        syncToolCursor();
      }
      endDragMove(false);
      return;
    }
    const dx = ev.clientX - pointerDownPos.x;
    const dy = ev.clientY - pointerDownPos.y;
    const moved = Math.hypot(dx, dy) > 6;
    const wasPainting = painting;
    const wasBulldozing = bulldozing;
    const wasDragging = draggingPropId;
    const didDragMove = dragMoved;
    painting = false;
    bulldozing = false;
    pointerDownPos = null;

    if (wasBulldozing) {
      if (controls) controls.enabled = controlsWasEnabled;
      onBulldozeEndCallback?.();
      syncToolCursor();
      return;
    }

    if (wasDragging) {
      const pid = wasDragging;
      const pt = hitGround(ev);
      endDragMove(false);
      if (didDragMove && pt && onMovePropCallback) {
        const meta = propMetaById[pid] || {};
        const { x, z } = snapPoint(pt, meta);
        onMovePropCallback({ id: pid, x, y: 0, z });
      } else if (!didDragMove) {
        selectProp(pid);
        selectPart(null);
      }
      return;
    }

    if (wasPainting && isPaintNetworkKind(placeBrush.value?.kind)) {
      if (moved) {
        // 拖拽铺设结束
        clearPaintAnchor();
        onPaintCallback?.();
        return;
      }
      // 单击：点到点铺路
      const pt = hitGround(ev);
      if (!pt) {
        onPaintCallback?.();
        return;
      }
      const { x, z } = snapPoint(pt, placeBrush.value);
      if (!paintAnchor) {
        paintAnchor = { x, z };
        void updatePathPreview({ x, z }, placeBrush.value);
        updateGhostAt({ x, y: 0, z }, placeBrush.value);
        return;
      }
      const snap = resolveSnapForBrush(placeBrush.value);
      const cells = paintRoadCells(paintAnchor.x, paintAnchor.z, x, z, snap);
      clearPaintAnchor();
      if (cells.length && onPlacePathCallback) {
        onPlacePathCallback({ cells, brush: placeBrush.value });
      } else if (cells.length && onPlaceCallback) {
        for (const c of cells) {
          onPlaceCallback({ x: c.x, y: 0, z: c.z, brush: placeBrush.value, paint: true });
        }
        onPaintCallback?.();
      }
      return;
    }

    // 设备 / 绿化等：即使轻微拖动也按落点放置（避免「点了没放上」）
    if (placeBrush.value && onPlaceCallback && !isPaintNetworkKind(placeBrush.value.kind)) {
      const pt = hitGround(ev);
      if (!pt) return;
      const { x, z } = snapPoint(pt, placeBrush.value);
      onPlaceCallback({ x, y: 0, z, brush: placeBrush.value });
      return;
    }
    if (moved) return;

    const pid = pickPropIdAtPointer(ev);
    if (pid) {
      selectProp(pid);
      selectPart(null);
      return;
    }

    setPointerFromEvent(ev);
    const meshes = [];
    world.root.traverse((o) => {
      if (o.isMesh && o.userData.partId && !o.userData.propId) meshes.push(o);
    });
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) {
      selectPart(null);
      selectProp(null);
      return;
    }
    selectProp(null);
    selectPart(hits[0].object.userData.partId);
  }

  function endDragMove(restoreCursor = true) {
    if (draggingPropId && controls) controls.enabled = controlsWasEnabled;
    draggingPropId = null;
    dragMoved = false;
    if (restoreCursor) syncToolCursor();
  }

  async function setPlaceBrush(brush) {
    if (brush && bulldozeMode.value) setBulldozeMode(false);
    placeBrush.value = brush;
    await ensureGhost(brush);
    syncToolCursor();
    syncOrbitForTools();
  }

  function clearPlaceBrush() {
    placeBrush.value = null;
    clearGhost();
    clearPaintAnchor();
    syncToolCursor();
    syncOrbitForTools();
  }

  function setOnPlace(cb) {
    onPlaceCallback = cb;
  }
  function setOnDeleteProp(cb) {
    onDeletePropCallback = cb;
  }
  function setOnPaintEnd(cb) {
    onPaintCallback = cb;
  }
  function setOnPlacePath(cb) {
    onPlacePathCallback = cb;
  }
  function setOnMoveProp(cb) {
    onMovePropCallback = cb;
  }
  function setOnBulldozeEnd(cb) {
    onBulldozeEndCallback = cb;
  }

  function ensurePlaceGrid(visible) {
    if (!scene) return;
    if (!placeGridHelper) {
      placeGridHelper = new THREE.GridHelper(64, 32, 0x6b8f71, 0xa3b8a8);
      placeGridHelper.position.y = 0.015;
      const mats = Array.isArray(placeGridHelper.material)
        ? placeGridHelper.material
        : [placeGridHelper.material];
      mats.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.45;
      });
      placeGridHelper.name = "placeModeGrid";
      scene.add(placeGridHelper);
    }
    // 空地环境已自带网格，避免叠两层
    const envHasGrid = envIdOf() === "blank";
    placeGridHelper.visible = !!visible && !envHasGrid;
  }

  function selectProp(propId) {
    selectedPropId.value = propId;
    clearOutline();
    if (!propId || !world || !scene) return;
    const propsGroup = world.root.getObjectByName("sceneProps");
    let target = null;
    for (const c of propsGroup?.children || []) {
      if (c.userData?.propId === propId) {
        target = c;
        break;
      }
      if (c.isInstancedMesh && c.userData?.instancePropIds?.includes(propId)) {
        const idx = c.userData.instancePropIds.indexOf(propId);
        const mat4 = new THREE.Matrix4();
        c.getMatrixAt(idx, mat4);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        mat4.decompose(pos, quat, scl);
        const proxy = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(0.8, scl.x * 2), 0.2, Math.max(0.8, scl.z * 2)),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        proxy.position.copy(pos);
        proxy.quaternion.copy(quat);
        proxy.userData._outlineProxy = true;
        scene.add(proxy);
        target = proxy;
        break;
      }
    }
    if (target) setOutline(target);
  }

  function clearOutline() {
    if (outlineHelper && scene) {
      const obj = outlineHelper.userData?._target;
      scene.remove(outlineHelper);
      outlineHelper.geometry?.dispose?.();
      outlineHelper.material?.dispose?.();
      if (obj?.userData?._outlineProxy) {
        scene.remove(obj);
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      }
    }
    outlineHelper = null;
  }

  function selectPart(partId) {
    selectedPartId.value = partId;
    world?.setHighlight(partId);
    clearOutline();
    // 不自动把镜头钉到部件中心，保持自由视角
  }

  function setLampOn(on) {
    world?.setLampOn(!!on);
  }

  /** 太阳在天空的位置：6 点东升，12 点中天，18 点西落 */
  function sunPosFromHour(hour, radius = SUN_RADIUS) {
    const h = ((Number(hour) % 24) + 24) % 24;
    // 白天 6–18 走半圆；夜晚沉到地平线下
    let angle;
    if (h >= 6 && h <= 18) {
      angle = ((h - 6) / 12) * Math.PI; // 0 → π
    } else if (h < 6) {
      angle = -((6 - h) / 6) * 0.35; // 略低于地平线
    } else {
      angle = Math.PI + ((h - 18) / 6) * 0.35;
    }
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = Math.sin(angle) * radius * 0.22;
    return new THREE.Vector3(x, y, z);
  }

  function buildSunSystem() {
    if (!scene) return;
    if (sunSystem?.group) {
      scene.remove(sunSystem.group);
      sunSystem.group.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose?.());
        }
      });
      sunSystem = null;
    }

    const group = new THREE.Group();
    group.name = "sunSystem";

    // 日弧轨迹（6–18）
    const pathPts = [];
    for (let i = 0; i <= 48; i++) {
      const h = 6 + (i / 48) * 12;
      pathPts.push(sunPosFromHour(h));
    }
    const pathGeo = new THREE.BufferGeometry().setFromPoints(pathPts);
    const pathLine = new THREE.Line(
      pathGeo,
      new THREE.LineBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    pathLine.name = "sunPath";
    group.add(pathLine);

    // 可见太阳
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 28, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe566 })
    );
    sunMesh.name = "sunDisc";
    sunMesh.castShadow = false;
    sunMesh.receiveShadow = false;
    group.add(sunMesh);

    // 柔光晕
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfff1b0,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    glow.name = "sunGlow";
    sunMesh.add(glow);

    scene.add(group);
    sunSystem = { group, sunMesh, pathLine };
  }

  function ensureShadowCatcher() {
    if (!scene || scene.getObjectByName("shadowCatcher")) return;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    ground.receiveShadow = true;
    ground.name = "shadowCatcher";
    scene.add(ground);
  }

  /** 昼夜：太阳沿轨迹运动 + 环境光/雾/阴影强度 */
  function setDayNight(hour, lampIsOn = false) {
    if (!hemiLight || !sunLight || !scene) return;
    const h = ((Number(hour) % 24) + 24) % 24;
    lastSimHour = h;

    let day = 1;
    if (h < 5 || h >= 20) day = 0.12;
    else if (h < 7) day = 0.12 + ((h - 5) / 2) * 0.75;
    else if (h < 17) day = 0.95;
    else if (h < 20) day = 0.95 - ((h - 17) / 3) * 0.83;

    const pos = sunPosFromHour(h);
    if (sunSystem?.sunMesh) {
      sunSystem.sunMesh.position.copy(pos);
      sunSystem.sunMesh.visible = pos.y > -1.5;
      const mat = sunSystem.sunMesh.material;
      if (h >= 16.5 && h < 19) mat.color.setHex(0xff9f5a);
      else if (h < 7.5 || h >= 19) mat.color.setHex(0xffc089);
      else mat.color.setHex(0xffe566);
    }

    sunLight.position.copy(pos);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();
    sunLight.intensity = Math.max(0.05, day * 1.35);
    sunLight.castShadow = pos.y > 2;
    if (h >= 16.5 && h < 19) sunLight.color.setHex(0xffc089);
    else if (day < 0.35) sunLight.color.setHex(0xa5b4fc);
    else sunLight.color.setHex(0xfff6e5);

    hemiLight.intensity = 0.28 + day * 0.75;
    if (day < 0.35) {
      hemiLight.color.setHex(0xb8c4d8);
      hemiLight.groundColor.setHex(0x2a3340);
    } else {
      hemiLight.color.setHex(0xf5f7f4);
      hemiLight.groundColor.setHex(0x6b7c73);
    }

    const nightBg = 0x1e293b;
    const meta = sceneMeta();
    const dayBg = meta.bg ?? 0xdde6e0;
    const c1 = new THREE.Color(dayBg);
    const c2 = new THREE.Color(nightBg);
    scene.background = c1.clone().lerp(c2, 1 - day);
    if (fogEnabled.value) {
      if (!scene.fog) scene.fog = new THREE.Fog(scene.background.getHex(), 28, 90);
      scene.fog.color.copy(scene.background);
      scene.fog.near = 24 + (1 - day) * 10;
      scene.fog.far = 70 + (1 - day) * 30;
    } else {
      scene.fog = null;
    }

    if (world?.lampLight) {
      world.lampLight.intensity = lampIsOn ? (day < 0.4 ? 4.2 : 3.0) : 0;
    }

    const catcher = scene.getObjectByName("shadowCatcher");
    if (catcher?.material) {
      catcher.material.opacity = 0.12 + day * 0.22;
      catcher.visible = pos.y > 1;
    }
  }

  let wireLinkGroup = null;
  let circuitReveal = false; // 铺电路 / 连线编辑时临时显示

  function setLayerVisible(layer, visible) {
    layers[layer] = !!visible;
    applyLayerVisibility();
  }

  /** 电路管网 + 设备连线：仅铺设/连线时可见 */
  function setCircuitVisible(on) {
    circuitReveal = !!on;
    layers.circuit = circuitReveal;
    applyLayerVisibility();
    if (wireLinkGroup) wireLinkGroup.visible = circuitReveal;
  }

  function resolvePropLayer(meta = {}, fallbackChild) {
    const raw = meta.layer || fallbackChild?.userData?.layer || layerOfProp(meta);
    return LAYER_KEYS.has(raw) ? raw : layerOfProp(meta);
  }

  function applyLayerVisibility() {
    if (!world) return;
    const assembly = world.root.getObjectByName("assembly");
    if (assembly) assembly.visible = !!layers.assembly;

    const propsGroup = world.root.getObjectByName("sceneProps");
    propsGroup?.children?.forEach((child) => {
      if (child.isInstancedMesh) {
        const layer = resolvePropLayer({ layer: child.userData?.layer }, child);
        child.visible = layers[layer] !== false;
        return;
      }
      const meta = propMetaById[child.userData?.propId] || {};
      const layer = resolvePropLayer(meta, child);
      child.visible = layers[layer] !== false;
    });
    if (wireLinkGroup) wireLinkGroup.visible = !!layers.circuit;
  }

  function clearWireLinkLines() {
    if (!wireLinkGroup || !scene) return;
    scene.remove(wireLinkGroup);
    wireLinkGroup.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    wireLinkGroup = null;
  }

  /**
   * 画设备间逻辑电线，随电路层显隐。
   * connected !== false → 黄；断路 → 红虚线感（半透明红）
   * @param {Array<{from:string,to:string,connected?:boolean}>} links
   * @param {Array<{id:string,x?:number,y?:number,z?:number}>} props
   */
  function syncWireLinkLines(links = [], props = [], { visible } = {}) {
    if (!scene) return;
    clearWireLinkLines();
    const byId = Object.fromEntries((props || []).map((p) => [p.id, p]));
    const group = new THREE.Group();
    group.name = "wireLinks";
    for (const link of links || []) {
      const a = byId[link.from];
      const b = byId[link.to];
      if (!a || !b) continue;
      const ok = link.connected !== false;
      const color = Number.isFinite(Number(link.color))
        ? Number(link.color)
        : ok
          ? 0xfbbf24
          : 0xef4444;
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: ok ? 0.95 : 0.75,
        depthTest: true,
      });
      const ay = (Number(a.y) || 0) + 0.35;
      const by = (Number(b.y) || 0) + 0.35;
      const pts = [
        new THREE.Vector3(Number(a.x) || 0, ay, Number(a.z) || 0),
        new THREE.Vector3(Number(b.x) || 0, by, Number(b.z) || 0),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, mat);
      line.userData.wireLinkId = link.id;
      line.userData.connected = ok;
      group.add(line);
    }
    group.visible = visible !== undefined ? !!visible : !!layers.circuit;
    scene.add(group);
    wireLinkGroup = group;
  }

  function setViews(views) {
    currentViews = views || {};
    if (!world) return;
    if (viewPlanes) {
      world.root.remove(viewPlanes);
      viewPlanes.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            m.map?.dispose?.();
            m.dispose?.();
          });
        }
      });
      viewPlanes = null;
    }
    const loader = new THREE.TextureLoader();
    viewPlanes = attachViewPlanes(world.root, currentViews, loader);
  }

  function setSceneType(typeId, { resetParts = true, sceneConfig } = {}) {
    currentSceneType = typeId || "street";
    if (sceneConfig) currentSceneConfig = { ...sceneConfig };
    applySceneLook(currentSceneType);
    if (!world) return;
    world.setEnvironment(currentSceneType, currentSceneConfig);
    if (resetParts) world.resetDefault();
    if (currentViews && Object.values(currentViews).some(Boolean)) {
      setViews(currentViews);
    }
    ensurePlaceGrid(buildMode.value || envIdOf() === "blank");
  }

  function setSceneConfig(config, { resetParts = false } = {}) {
    currentSceneConfig = { ...(config || {}) };
    if (!world) return;
    world.setEnvironment(currentSceneType, currentSceneConfig);
    if (resetParts) world.resetDefault();
    if (currentViews && Object.values(currentViews).some(Boolean)) {
      setViews(currentViews);
    }
    ensurePlaceGrid(buildMode.value || envIdOf() === "blank");
  }

  async function applyAnnotations(annotations, views, projectParts = [], opts = {}) {
    if (!world) return { ok: false, count: 0 };
    const layout = buildLayoutFromAnnotations(annotations || {});
    const count = Object.keys(layout).length;

    let modelRoot = null;
    const assemblyModel =
      opts.assemblyModel ||
      (envIdOf() === "street" ? { kind: "builtin", id: "street_light" } : null);
    if (assemblyModel && (assemblyModel.id || assemblyModel.url)) {
      try {
        modelRoot = await resolveModel(assemblyModel);
      } catch {
        modelRoot = null;
      }
    }

    const partModels = {};
    await Promise.all(
      (projectParts || []).map(async (p) => {
        if (!p?.id || !p.model || (modelRoot && findPartInModel(modelRoot, p.id))) return;
        try {
          partModels[p.id] = await resolveModel(p.model, { partId: p.id });
        } catch {
          /* ignore */
        }
      })
    );

    const textures = {};
    if (!modelRoot) {
      const viewMap = views || currentViews || {};
      await Promise.all(
        Object.entries(layout).map(async ([partId, conf]) => {
          if (!conf.texture?.view || !conf.texture?.box) return;
          const url = viewMap[conf.texture.view];
          if (!url) return;
          try {
            textures[partId] = await cropViewToCanvas(url, conf.texture.box);
          } catch {
            /* ignore */
          }
        })
      );
    }

    if (!count && !modelRoot) {
      world.resetDefault();
    } else {
      world.applyAssembly(layout, textures, {
        labels: labelsMap(projectParts),
        shapes: shapesMap(projectParts),
        modelRoot,
        partModels,
      });
    }

    await applyScenePropList(opts.sceneProps || []);
    return { ok: true, count, usedModel: !!modelRoot };
  }

  function findPartInModel(root, partId) {
    let hit = false;
    root.traverse((o) => {
      if (o.userData?.partId === partId || o.name === partId) hit = true;
    });
    return hit;
  }

  /** 深拷贝几何/材质，避免 dispose 时毁掉模板缓存导致模型消失 */
  function clonePropRoot(tpl) {
    return deepCloneModel(tpl);
  }

  /**
   * 场景物体重建（串行 + 代数号，避免铺路过快竞态把几何 dispose 掉）
   */
  function applyScenePropList(propDefs = []) {
    const snapshot = Array.isArray(propDefs) ? [...propDefs] : [];
    const gen = ++applyPropsGen;
    applyPropsQueue = applyPropsQueue
      .then(() => applyScenePropListNow(snapshot, gen))
      .catch(() => {});
    return applyPropsQueue;
  }

  function clearDeviceStatusFx() {
    for (const fx of Object.values(deviceStatusFx)) {
      fx.marker?.parent?.remove(fx.marker);
      fx.marker?.geometry?.dispose?.();
      fx.marker?.material?.dispose?.();
    }
    deviceStatusFx = {};
  }

  function makePlaceholderRoot(def) {
    const layer = layerOfProp(def);
    const color = layer === "device" ? 0x38bdf8 : layer === "decoration" ? 0x65a30d : 0x94a3b8;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.55,
        metalness: 0.1,
      })
    );
    body.position.y = 0.45;
    g.add(body);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x44403c })
    );
    pole.position.y = 0.15;
    g.add(pole);
    return g;
  }

  function resolvePropModelSpec(def) {
    const m = def?.model;
    if (m && (m.kind === "glb" || m.kind === "gltf") && m.url) return m;
    if (m && m.kind === "builtin" && m.id) return m;
    if (m && m.url) return { kind: "glb", url: m.url, fit: m.fit };
    if (m && m.id) return { kind: "builtin", id: m.id };
    const aid = def?.asset_id;
    if (aid) return { kind: "builtin", id: aid };
    return null;
  }

  async function applyScenePropListNow(propDefs, gen) {
    if (!world?.applySceneProps) return;
    if (gen !== applyPropsGen) return;

    // 放置类图层始终保持可见，避免工程里存了 false 导致「放了看不见」
    layers.device = true;
    layers.decoration = true;
    layers.road = true;
    layers.building = true;
    layers.water = true;

    propMetaById = {};
    propRootsById = {};
    clearDeviceStatusFx();
    const items = [];
    const templateCache = new Map();

    async function loadTemplate(spec) {
      const key = `${spec?.kind}:${spec?.id || spec?.url || ""}`;
      if (templateCache.has(key)) return templateCache.get(key);
      try {
        const root = await resolveModel(spec);
        if (root) {
          templateCache.set(key, root);
          return root;
        }
      } catch {
        /* fall through */
      }
      return null;
    }

    const groups = new Map();
    for (const def of propDefs) {
      const spec = resolvePropModelSpec(def) || { kind: "builtin", id: "_placeholder" };
      const key = `${spec.kind}:${spec.id || spec.url || ""}:${layerOfProp(def)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ def, spec });
    }

    for (const [, list] of groups) {
      if (gen !== applyPropsGen) return;
      const layer = layerOfProp(list[0].def);
      let tpl = null;
      if (list[0].spec?.id !== "_placeholder") {
        tpl = await loadTemplate(list[0].spec);
      }
      for (const { def } of list) {
        let root = tpl ? clonePropRoot(tpl) : null;
        if (!root) root = makePlaceholderRoot(def);
        // 清除可能残留的透明（预览材质不应进实体，这里兜底）
        root.traverse((c) => {
          if (!c.isMesh || !c.material) return;
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) {
            if (!m) continue;
            if (m.transparent && m.opacity < 0.99) {
              m.transparent = false;
              m.opacity = 1;
              m.depthWrite = true;
            }
            m.needsUpdate = true;
          }
        });
        root.position.set(def.x || 0, def.y || 0, def.z || 0);
        root.rotation.y = def.rotY || 0;
        const s = typeof def.scale === "number" ? def.scale : 1;
        if (s !== 1) root.scale.multiplyScalar(s);
        const propId = def.id || `prop_${items.length}`;
        root.userData.propId = propId;
        root.userData.layer = layer;
        root.name = propId;
        root.visible = true;
        propMetaById[propId] = { ...def, layer };
        propRootsById[propId] = root;
        root.traverse((c) => {
          if (c.isMesh) {
            c.userData.propId = propId;
            c.userData.layer = layer;
            c.visible = true;
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        items.push({ root });
      }
    }

    if (gen !== applyPropsGen) return;
    world.applySceneProps(items);
    applyLayerVisibility();
    if (selectedPropId.value) selectProp(selectedPropId.value);
  }

  /**
   * 按影子状态给设备上色 + 头顶状态灯（不重建几何）
   * @param {Array<{ id: string, color: number, level: string, blink?: boolean }>} statuses
   */
  function applyDeviceStatuses(statuses = []) {
    // 仅已绑定且有效状态；未绑定不建灯、不上色
    const active = (statuses || []).filter(
      (s) => s?.id && s.level && s.level !== "idle"
    );
    const want = new Set(active.map((s) => s.id));
    for (const id of Object.keys(deviceStatusFx)) {
      if (want.has(id)) continue;
      const fx = deviceStatusFx[id];
      fx.marker?.parent?.remove(fx.marker);
      fx.marker?.geometry?.dispose?.();
      fx.marker?.material?.dispose?.();
      // 恢复材质
      for (const m of fx.mats || []) {
        if (m.userData?._statusBase != null) {
          m.emissive.setHex(m.userData._statusBase);
          m.emissiveIntensity = m.userData._statusBaseInt ?? 0;
        }
      }
      delete deviceStatusFx[id];
    }

    for (const st of active) {
      const root = propRootsById[st.id];
      if (!root) continue;
      let fx = deviceStatusFx[st.id];
      if (!fx) {
        const mats = [];
        root.traverse((c) => {
          if (!c.isMesh || !c.material) return;
          const list = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of list) {
            if (!m.emissive) continue;
            if (m.userData._statusBase == null) {
              m.userData._statusBase = m.emissive.getHex();
              m.userData._statusBaseInt = m.emissiveIntensity || 0;
            }
            mats.push(m);
          }
        });
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 12, 12),
          new THREE.MeshStandardMaterial({
            color: st.color || 0x38bdf8,
            emissive: st.color || 0x38bdf8,
            emissiveIntensity: 0.85,
            transparent: true,
            opacity: 0.95,
            roughness: 0.35,
            metalness: 0.1,
          })
        );
        marker.name = "statusMarker";
        marker.castShadow = false;
        marker.receiveShadow = false;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        marker.position.set(0, Math.max(0.6, size.y + 0.25), 0);
        root.add(marker);
        fx = { marker, mats, blink: false, baseColor: st.color || 0x38bdf8 };
        deviceStatusFx[st.id] = fx;
      }
      fx.blink = !!st.blink || st.level === "alarm" || st.level === "warn";
      fx.baseColor = st.color || 0x38bdf8;
      if (fx.marker?.material) {
        fx.marker.material.color.setHex(fx.baseColor);
        fx.marker.material.emissive.setHex(fx.baseColor);
        fx.marker.material.opacity = fx.blink ? 0.9 : 0.95;
        fx.marker.visible = true;
      }
      for (const m of fx.mats) {
        m.emissive.setHex(fx.baseColor);
        m.emissiveIntensity =
          st.level === "alarm" ? 0.65 : st.level === "warn" ? 0.45 : st.level === "on" ? 0.4 : 0.22;
      }
    }
  }

  function focusProp(propId) {
    const root = propRootsById[propId];
    if (!root || !camera || !controls) return false;
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(3.5, size.length() * 2.4);
    controls.target.copy(center);
    camera.position.set(center.x + dist * 0.55, center.y + Math.max(1.6, dist * 0.4), center.z + dist * 0.7);
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();
    selectProp(propId);
    return true;
  }

  function getCameraState() {
    if (!camera || !controls) return null;
    return {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    };
  }

  function restoreCameraState(state) {
    if (!state || !camera || !controls) return;
    if (Array.isArray(state.pos) && state.pos.length >= 3) {
      camera.position.set(state.pos[0], state.pos[1], state.pos[2]);
    }
    if (Array.isArray(state.target) && state.target.length >= 3) {
      controls.target.set(state.target[0], state.target[1], state.target[2]);
    }
    controls.update();
  }

  function resetDefaultModel() {
    world?.resetDefault();
  }

  function setCameraPreset(name) {
    if (!camera || !controls) return;
    // 预设只移动镜头，不把场景物体锁到画面正中
    const look = controls.target.clone();
    const presets = {
      orbit: { pos: [look.x + 14, 16, look.z + 18], polar: Math.PI * 0.48 },
      top: { pos: [look.x, 32, look.z + 0.05], polar: 0.08 },
      build: { pos: [look.x, 36, look.z + 0.05], polar: 0.08 },
      lamp: { pos: [look.x + 2.5, look.y + 8, look.z + 6], polar: Math.PI * 0.48 },
      board: { pos: [look.x + 2.2, look.y + 4, look.z - 0.5], polar: Math.PI * 0.48 },
      room: { pos: [0, 16, 14], target: [0, 0.5, 0.5], polar: Math.PI * 0.42 },
    };
    const p = presets[name] || presets.orbit;
    if (p.target) controls.target.set(...p.target);
    camera.position.set(...p.pos);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minPolarAngle = name === "top" || name === "build" ? 0.05 : 0.05;
    controls.update();
  }

  /** 室内分房间镜头：target + pos */
  function focusLookAt(target = [0, 1, 0], pos = [0, 8, 12]) {
    if (!camera || !controls) return;
    controls.target.set(target[0], target[1], target[2]);
    camera.position.set(pos[0], pos[1], pos[2]);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minPolarAngle = 0.02;
    controls.update();
  }

  function setBuildMode(on) {
    buildMode.value = !!on;
    ensurePlaceGrid(buildMode.value || envIdOf() === "blank");
    if (on) {
      // 略抬高俯视，仍可用 WASD / QE / ZX 自由移动，不强制钉死原点
      setCameraPreset("build");
      if (canvasEl && !placeBrush.value) canvasEl.style.cursor = "default";
    } else {
      endDragMove();
      controls.maxPolarAngle = Math.PI * 0.48;
      controls.minPolarAngle = 0.08;
      if (canvasEl && !placeBrush.value) canvasEl.style.cursor = "";
    }
    syncOrbitForTools();
  }

  function dispose() {
    cancelAnimationFrame(raf);
    raf = 0;
    resizeObs?.disconnect();
    resizeObs = null;
    canvasEl?.removeEventListener("pointerdown", onPointerDown);
    canvasEl?.removeEventListener("pointermove", onPointerMove);
    canvasEl?.removeEventListener("pointerup", onPointerUp);
    canvasEl?.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", clearHeldKeys);
    clearHeldKeys();
    clearPlaceBrush();
    clearWireLinkLines();
    clearOutline();
    clearDeviceStatusFx();
    propRootsById = {};
    endDragMove();
    pointerDownPos = null;
    if (placeGridHelper && scene) {
      scene.remove(placeGridHelper);
      placeGridHelper.geometry?.dispose?.();
      const mats = Array.isArray(placeGridHelper.material)
        ? placeGridHelper.material
        : [placeGridHelper.material];
      mats.forEach((m) => m?.dispose?.());
    }
    placeGridHelper = null;
    if (sunSystem?.group && scene) {
      scene.remove(sunSystem.group);
      sunSystem.group.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose?.());
        }
      });
    }
    sunSystem = null;
    const catcher = scene?.getObjectByName("shadowCatcher");
    if (catcher && scene) {
      scene.remove(catcher);
      catcher.geometry?.dispose?.();
      catcher.material?.dispose?.();
    }
    controls?.dispose();
    world?.dispose();
    renderer?.dispose();
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    world = null;
    viewPlanes = null;
    canvasEl = null;
    groundPlane = null;
    hemiLight = null;
    sunLight = null;
  }

  onBeforeUnmount(dispose);

  return {
    selectedPartId,
    selectedPropId,
    placeBrush,
    buildMode,
    bulldozeMode,
    fogEnabled,
    layers,
    init,
    dispose,
    selectPart,
    selectProp,
    setPlaceBrush,
    clearPlaceBrush,
    setOnPlace,
    setOnDeleteProp,
    setOnPaintEnd,
    setOnPlacePath,
    setOnMoveProp,
    setOnBulldozeEnd,
    clearPaintAnchor,
    setBulldozeMode,
    setLampOn,
    setDayNight,
    setFogEnabled,
    setLayerVisible,
    setCircuitVisible,
    syncWireLinkLines,
    clearWireLinkLines,
    setViews,
    setCameraPreset,
    focusLookAt,
    focusProp,
    applyDeviceStatuses,
    getCameraState,
    restoreCameraState,
    setBuildMode,
    applyAnnotations,
    applyScenePropList,
    resetDefaultModel,
    setCustomSceneTypes,
    setSceneType,
    setSceneConfig,
  };
}
