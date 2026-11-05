/**
 * 主题预设（配色参考公开色板站点，已整理为界面可用 token）
 * 来源标注见 source 字段。
 */

export const THEME_PRESETS = [
  {
    id: "silo_sage",
    name: "仓廪青",
    source: "ColorBlend · Light Grey / Green Earth",
    sourceUrl: "https://www.colorblend.io/palette/cmjom9r1x00013znr4yjvqumq",
    vars: {
      ink: "#3E4F3F",
      inkSoft: "#4F6F4F",
      muted: "#7A8A6A",
      accent: "#4F6F4F",
      accentDeep: "#3E4F3F",
      accentSoft: "#E6EAD9",
      straw: "#AFC4A6",
      surface: "rgba(246, 248, 240, 0.82)",
      surfaceSolid: "#F2F4EE",
      surface2: "#E6EAD9",
      bg1: "#E6EAD9",
      bg2: "#F2F4EE",
      glow1: "rgba(175, 196, 166, 0.35)",
      glow2: "rgba(79, 111, 79, 0.16)",
      sideBg: "linear-gradient(180deg, rgba(242, 244, 238, 0.95), rgba(230, 234, 217, 0.9))",
    },
    previewBg:
      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1600&q=70",
  },
  {
    id: "eco_organic",
    name: "有机田野",
    source: "ColorVio · Eco & Organic",
    sourceUrl: "https://colorvio.com/collection/eco-organic",
    vars: {
      ink: "#2F5233",
      inkSoft: "#3d5c40",
      muted: "#8B6F47",
      accent: "#5A8A4C",
      accentDeep: "#2F5233",
      accentSoft: "#EFE6D5",
      straw: "#97BC62",
      surface: "rgba(239, 230, 213, 0.86)",
      surfaceSolid: "#EFE6D5",
      surface2: "#D4C9A8",
      bg1: "#EFE6D5",
      bg2: "#D4C9A8",
      glow1: "rgba(151, 188, 98, 0.28)",
      glow2: "rgba(139, 111, 71, 0.18)",
      sideBg: "linear-gradient(180deg, rgba(239, 230, 213, 0.96), rgba(212, 201, 168, 0.88))",
    },
    previewBg:
      "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1600&q=70",
  },
  {
    id: "deep_current",
    name: "深流青茶",
    source: "ColorsWall · Deep Current / Gable Green",
    sourceUrl: "https://colorswall.com/palette/402990",
    vars: {
      ink: "#2C4641",
      inkSoft: "#364141",
      muted: "#5a6e6a",
      accent: "#007381",
      accentDeep: "#2C4641",
      accentSoft: "#F9EAE5",
      straw: "#ECD0A1",
      surface: "rgba(249, 234, 229, 0.88)",
      surfaceSolid: "#F9EAE5",
      surface2: "#FAE3BC",
      bg1: "#F9EAE5",
      bg2: "#ECD0A1",
      glow1: "rgba(0, 115, 129, 0.16)",
      glow2: "rgba(160, 110, 87, 0.18)",
      sideBg: "linear-gradient(180deg, rgba(249, 234, 229, 0.96), rgba(250, 227, 188, 0.9))",
    },
    previewBg:
      "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1600&q=70",
  },
  {
    id: "solar_tide",
    name: "日潮蓝橙",
    source: "Color Agent · Solar Tide",
    sourceUrl: "https://coloragent.dev/palettes",
    vars: {
      ink: "#023047",
      inkSoft: "#034058",
      muted: "#4a6a7a",
      accent: "#219EBC",
      accentDeep: "#023047",
      accentSoft: "#E8F4F8",
      straw: "#FFB703",
      surface: "rgba(255, 255, 255, 0.86)",
      surfaceSolid: "#FFFFFF",
      surface2: "#E8F4F8",
      bg1: "#E8F4F8",
      bg2: "#D6EAF2",
      glow1: "rgba(33, 158, 188, 0.22)",
      glow2: "rgba(251, 133, 0, 0.16)",
      sideBg: "linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(232, 244, 248, 0.92))",
    },
    previewBg:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=70",
  },
  {
    id: "orchard_banner",
    name: "果园暖褐",
    source: "Color Agent · Orchard / Terra",
    sourceUrl: "https://coloragent.dev/palettes",
    vars: {
      ink: "#333D29",
      inkSoft: "#414833",
      muted: "#656D4A",
      accent: "#7F4F24",
      accentDeep: "#582F0E",
      accentSoft: "#E8E4D4",
      straw: "#A68A64",
      surface: "rgba(194, 197, 170, 0.35)",
      surfaceSolid: "#F4F1E6",
      surface2: "#C2C5AA",
      bg1: "#C2C5AA",
      bg2: "#B6AD90",
      glow1: "rgba(127, 79, 36, 0.18)",
      glow2: "rgba(165, 138, 100, 0.22)",
      sideBg: "linear-gradient(180deg, rgba(244, 241, 230, 0.96), rgba(194, 197, 170, 0.88))",
    },
    previewBg:
      "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1600&q=70",
  },
  {
    id: "cotton_mist",
    name: "棉雾柔粉",
    source: "Color Agent · Cotton Candy（柔化）",
    sourceUrl: "https://coloragent.dev/palettes",
    vars: {
      ink: "#5C4B51",
      inkSoft: "#6d5a60",
      muted: "#9D8189",
      accent: "#9D8189",
      accentDeep: "#6d5a60",
      accentSoft: "#FFE5D9",
      straw: "#F4ACB7",
      surface: "rgba(255, 229, 217, 0.78)",
      surfaceSolid: "#FFF8F5",
      surface2: "#FFCAD4",
      bg1: "#FFE5D9",
      bg2: "#D8E2DC",
      glow1: "rgba(244, 172, 183, 0.28)",
      glow2: "rgba(157, 129, 137, 0.16)",
      sideBg: "linear-gradient(180deg, rgba(255, 248, 245, 0.96), rgba(255, 229, 217, 0.9))",
    },
    previewBg:
      "https://images.unsplash.com/photo-1499002238440-d264edd596ec?auto=format&fit=crop&w=1600&q=70",
  },
];

export const DEFAULT_APPEARANCE = {
  theme_id: "silo_sage",
  brand_title: "华为云IOT",
  brand_subtitle: "Huawei Cloud IoT",
  brand_tagline: "华为云IOT",
  button_color: "",
  border_color: "",
  background_image: "",
  background_overlay: 0.72,
};

export function getPreset(id) {
  return THEME_PRESETS.find((t) => t.id === id) || THEME_PRESETS[0];
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(36, 58, 48, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function softTint(hex, mix = 0.85) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#d7ebe2";
  const r = Math.round(rgb.r * (1 - mix) + 255 * mix);
  const g = Math.round(rgb.g * (1 - mix) + 255 * mix);
  const b = Math.round(rgb.b * (1 - mix) + 255 * mix);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function darken(hex, amount = 0.18) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r * (1 - amount));
  const g = Math.round(rgb.g * (1 - amount));
  const b = Math.round(rgb.b * (1 - amount));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 将外观配置应用到 document.documentElement
 */
export function applyAppearance(appearance = {}) {
  const conf = { ...DEFAULT_APPEARANCE, ...appearance };
  const preset = getPreset(conf.theme_id);
  const root = document.documentElement;
  const v = { ...preset.vars };

  const button = conf.button_color || v.accent;
  const border = conf.border_color || v.ink;

  root.style.setProperty("--ink", v.ink);
  root.style.setProperty("--ink-soft", v.inkSoft);
  root.style.setProperty("--muted", v.muted);
  root.style.setProperty("--accent", button);
  root.style.setProperty("--accent-deep", darken(button, 0.22));
  root.style.setProperty("--accent-soft", softTint(button, 0.82));
  root.style.setProperty("--straw", v.straw);
  root.style.setProperty("--ok", button);
  root.style.setProperty("--surface", v.surface);
  root.style.setProperty("--surface-solid", v.surfaceSolid);
  root.style.setProperty("--surface-2", v.surface2);
  root.style.setProperty("--bg-1", v.bg1);
  root.style.setProperty("--bg-2", v.bg2);
  root.style.setProperty("--glow-1", v.glow1);
  root.style.setProperty("--glow-2", v.glow2);
  root.style.setProperty("--side-bg", v.sideBg);
  root.style.setProperty("--line", withAlpha(border, 0.14));
  root.style.setProperty("--line-strong", withAlpha(border, 0.28));
  root.style.setProperty("--button-fg", "#ffffff");

  const overlay = Math.min(0.92, Math.max(0.35, Number(conf.background_overlay) || 0.72));
  root.style.setProperty("--bg-overlay", String(overlay));

  const img = (conf.background_image || "").trim();
  if (img) {
    root.style.setProperty("--bg-image", `url("${img}")`);
    root.classList.add("has-bg-image");
  } else {
    root.style.setProperty("--bg-image", "none");
    root.classList.remove("has-bg-image");
  }

  return {
    ...conf,
    resolved_button: button,
    resolved_border: border,
    preset,
  };
}
