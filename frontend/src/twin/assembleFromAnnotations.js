/**
 * 把三视图归一化标注框合成为各部件的 3D 布局。
 *
 * annotations: {
 *   front?: [{ id, partId, box:[x,y,w,h] }],
 *   side?:  [...],
 *   top?:   [...],
 * }
 *
 * 坐标系约定（缩微场景）：
 *  front: x→世界X(-6~6), y→世界Y(8~0)
 *  side:  x→世界Z(6~-6), y→世界Y(8~0)
 *  top:   x→世界X(-6~6), y→世界Z(-6~6)
 */

const SPAN_X = 12;
const SPAN_Y = 8;
const SPAN_Z = 12;

function findAnn(list, partId) {
  return (list || []).find((a) => a.partId === partId);
}

function centerOf(box) {
  const [x, y, w, h] = box;
  return { cx: x + w / 2, cy: y + h / 2, w, h };
}

/**
 * @returns {Record<string, { position:[number,number,number], scale:[number,number,number], texture?: { view:string, box:number[] } }>}
 */
export function buildLayoutFromAnnotations(annotations = {}) {
  const front = annotations.front || [];
  const side = annotations.side || [];
  const top = annotations.top || [];
  const partIds = new Set(
    [...front, ...side, ...top].map((a) => a.partId).filter(Boolean)
  );

  const layout = {};
  for (const partId of partIds) {
    const f = findAnn(front, partId);
    const s = findAnn(side, partId);
    const t = findAnn(top, partId);

    let x = 0;
    let y = 1.2;
    let z = 0;
    let sx = 1;
    let sy = 1;
    let sz = 1;

    if (f) {
      const c = centerOf(f.box);
      x = (c.cx - 0.5) * SPAN_X;
      y = (1 - c.cy) * SPAN_Y;
      sx = Math.max(0.25, c.w * SPAN_X);
      sy = Math.max(0.25, c.h * SPAN_Y);
      sz = sx * 0.55;
    }
    if (s) {
      const c = centerOf(s.box);
      z = (0.5 - c.cx) * SPAN_Z;
      if (!f) {
        y = (1 - c.cy) * SPAN_Y;
        sy = Math.max(0.25, c.h * SPAN_Y);
      }
      sz = Math.max(0.25, c.w * SPAN_Z);
      if (!f) sx = sz * 0.55;
    }
    if (t) {
      const c = centerOf(t.box);
      x = (c.cx - 0.5) * SPAN_X;
      z = (c.cy - 0.5) * SPAN_Z;
      sx = Math.max(0.25, c.w * SPAN_X);
      sz = Math.max(0.25, c.h * SPAN_Z);
      if (!f && !s) sy = Math.max(sx, sz) * 0.35;
    }

    // 灯杆：高度用 front/side 的 h，截面用较小边
    if (partId === "pole") {
      if (f) {
        const c = centerOf(f.box);
        sy = Math.max(1.5, c.h * SPAN_Y);
        sx = Math.max(0.2, Math.min(c.w * SPAN_X, 1.2));
        sz = sx;
        y = sy / 2;
      }
    }
    // 灯头贴在杆顶附近：若有 front 框则用框中心
    if (partId === "lamp" && f) {
      const c = centerOf(f.box);
      y = (1 - c.cy) * SPAN_Y;
      sx = Math.max(0.4, c.w * SPAN_X);
      sy = Math.max(0.2, c.h * SPAN_Y);
      sz = Math.max(0.3, sx * 0.65);
    }

    const textureSrc = f || s || t;
    const viewKey = f ? "front" : s ? "side" : "top";

    layout[partId] = {
      position: [x, y, z],
      scale: [sx, sy, sz],
      texture: textureSrc
        ? { view: viewKey, box: [...textureSrc.box] }
        : null,
    };
  }
  return layout;
}

/** 从图片 URL 裁切归一化 box，返回 HTMLCanvasElement */
export async function cropViewToCanvas(imageUrl, box) {
  const img = await loadImage(imageUrl);
  const [nx, ny, nw, nh] = box;
  const sx = Math.floor(nx * img.naturalWidth);
  const sy = Math.floor(ny * img.naturalHeight);
  const sw = Math.max(1, Math.floor(nw * img.naturalWidth));
  const sh = Math.max(1, Math.floor(nh * img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`无法加载图片: ${url}`));
    img.src = url;
  });
}

export function countAnnotations(annotations = {}) {
  return ["front", "side", "top"].reduce(
    (n, k) => n + ((annotations[k] || []).length || 0),
    0
  );
}
