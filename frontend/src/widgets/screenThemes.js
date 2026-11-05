/**
 * 大屏主题预设
 * 配色取自国际通行色板：Nord / Tokyo Night / Catppuccin / Solarized / Gruvbox / Open Color
 * 官方参考：
 * - https://www.nordtheme.com/
 * - https://github.com/enkia/tokyo-night-vscode-theme
 * - https://github.com/catppuccin/catppuccin
 * - https://ethanschoonover.com/solarized/
 * - https://github.com/morhetz/gruvbox
 * - https://yeun.github.io/open-color/
 */

export const SCREEN_THEME_PRESETS = [
  {
    id: "nord_polar",
    name: "Nord 极光",
    source: "Nord · Arctic North-bluish",
    vars: {
      // Polar Night + Snow Storm + Frost / Aurora
      background: "#2e3440",
      card_bg: "rgba(59, 66, 82, 0.92)",
      card_border: "#4c566a",
      title_color: "#eceff4",
      text_color: "#e5e9f0",
      muted_color: "#d8dee9",
      accent: "#88c0d0",
      accent2: "#a3be8c",
      chart_border: "#4c566a",
    },
  },
  {
    id: "tokyo_night",
    name: "Tokyo Night",
    source: "Tokyo Night · Storm",
    vars: {
      // tokyo-night-storm
      background: "#24283b",
      card_bg: "rgba(36, 40, 59, 0.94)",
      card_border: "#414868",
      title_color: "#c0caf5",
      text_color: "#c0caf5",
      muted_color: "#a9b1d6",
      accent: "#7aa2f7",
      accent2: "#9ece6a",
      chart_border: "#414868",
    },
  },
  {
    id: "catppuccin_mocha",
    name: "Catppuccin Mocha",
    source: "Catppuccin · Mocha",
    vars: {
      // Base / Surface0 / Text / Teal / Peach
      background: "#1e1e2e",
      card_bg: "rgba(49, 50, 68, 0.92)",
      card_border: "#45475a",
      title_color: "#cdd6f4",
      text_color: "#cdd6f4",
      muted_color: "#a6adc8",
      accent: "#94e2d5",
      accent2: "#fab387",
      chart_border: "#45475a",
    },
  },
  {
    id: "catppuccin_latte",
    name: "Catppuccin Latte",
    source: "Catppuccin · Latte",
    vars: {
      // Light flavor
      background: "#eff1f5",
      card_bg: "rgba(255, 255, 255, 0.94)",
      card_border: "#ccd0da",
      title_color: "#4c4f69",
      text_color: "#4c4f69",
      muted_color: "#6c6f85",
      accent: "#179299",
      accent2: "#fe640b",
      chart_border: "#ccd0da",
    },
  },
  {
    id: "solarized_dark",
    name: "Solarized Dark",
    source: "Ethan Schoonover · Solarized",
    vars: {
      // base03 / base02 / base0 / cyan / yellow
      background: "#002b36",
      card_bg: "rgba(7, 54, 66, 0.94)",
      card_border: "#586e75",
      title_color: "#fdf6e3",
      text_color: "#eee8d5",
      muted_color: "#93a1a3",
      accent: "#2aa198",
      accent2: "#b58900",
      chart_border: "#586e75",
    },
  },
  {
    id: "gruvbox_dark",
    name: "Gruvbox",
    source: "morhetz · Gruvbox Dark Soft",
    vars: {
      // bg / bg1 / fg / aqua / orange
      background: "#32302f",
      card_bg: "rgba(60, 56, 54, 0.94)",
      card_border: "#504945",
      title_color: "#ebdbb2",
      text_color: "#ebdbb2",
      muted_color: "#a89984",
      accent: "#8ec07c",
      accent2: "#fe8019",
      chart_border: "#504945",
    },
  },
];

/** 旧预设 ID → 新预设（已保存大屏仍可解析） */
const LEGACY_PRESET_MAP = {
  night_teal: "nord_polar",
  analytics_blue: "tokyo_night",
  teal_light: "catppuccin_latte",
  amber_grain: "gruvbox_dark",
  jade_mist: "catppuccin_latte",
  violet_ops: "catppuccin_mocha",
};

export const FONT_STYLES = [
  { id: "sora", label: "现代无衬线 (Sora)", css: '"Sora", "Noto Sans SC", sans-serif' },
  { id: "sans", label: "系统无衬线", css: '"Noto Sans SC", "PingFang SC", sans-serif' },
  { id: "serif", label: "衬线标题风", css: '"Noto Serif SC", "Songti SC", serif' },
  { id: "mono", label: "等宽数据风", css: '"Sora", "Consolas", monospace' },
];

export const DEFAULT_SCREEN_THEME = {
  preset_id: "nord_polar",
  background: "#2e3440",
  background_image: "",
  background_overlay: 0.62,
  card_bg: "rgba(59, 66, 82, 0.92)",
  card_border: "#4c566a",
  title_color: "#eceff4",
  text_color: "#e5e9f0",
  muted_color: "#d8dee9",
  accent: "#88c0d0",
  accent2: "#a3be8c",
  chart_border: "#4c566a",
  font_style: "sans",
  title_size: 32,
  card_title_size: 13,
  value_size: 30,
  card_radius: 14,
  card_shadow: true,
};

export function getScreenPreset(id) {
  const mapped = LEGACY_PRESET_MAP[id] || id;
  return SCREEN_THEME_PRESETS.find((p) => p.id === mapped) || SCREEN_THEME_PRESETS[0];
}

export function mergeScreenTheme(raw = {}) {
  const base = { ...DEFAULT_SCREEN_THEME, ...(raw || {}) };
  if (raw?.preset_id && !raw.background) {
    const p = getScreenPreset(raw.preset_id);
    Object.assign(base, p.vars, { preset_id: p.id });
  } else if (raw?.preset_id && LEGACY_PRESET_MAP[raw.preset_id]) {
    base.preset_id = LEGACY_PRESET_MAP[raw.preset_id];
  }
  return base;
}

export function applyPresetToTheme(theme, presetId) {
  const p = getScreenPreset(presetId);
  return {
    ...theme,
    preset_id: p.id,
    ...p.vars,
  };
}

export function fontCss(fontStyle) {
  return FONT_STYLES.find((f) => f.id === fontStyle)?.css || FONT_STYLES[1].css;
}

/** 生成可绑定到元素 style 的对象 */
export function screenThemeStyle(theme) {
  const t = mergeScreenTheme(theme);
  const img = (t.background_image || "").trim();
  const overlay = Math.min(0.95, Math.max(0.2, Number(t.background_overlay) || 0.62));
  const bgImage = img
    ? `linear-gradient(180deg, rgba(0,0,0,${overlay * 0.35}), rgba(0,0,0,${overlay * 0.55})), url("${img}")`
    : `radial-gradient(900px 480px at 10% -10%, ${t.accent}33, transparent 50%), radial-gradient(800px 420px at 100% 0%, ${t.accent2}22, transparent 45%), linear-gradient(180deg, ${t.background}, ${t.background})`;

  return {
    "--sc-bg": t.background,
    "--sc-card": t.card_bg,
    "--sc-border": t.card_border,
    "--sc-chart-border": t.chart_border,
    "--sc-title": t.title_color,
    "--sc-text": t.text_color,
    "--sc-muted": t.muted_color,
    "--sc-accent": t.accent,
    "--sc-accent2": t.accent2,
    "--sc-font": fontCss(t.font_style),
    "--sc-title-size": `${t.title_size || 32}px`,
    "--sc-card-title-size": `${t.card_title_size || 13}px`,
    "--sc-value-size": `${t.value_size || 30}px`,
    "--sc-radius": `${t.card_radius ?? 14}px`,
    "--sc-shadow": t.card_shadow === false ? "none" : "0 8px 28px rgba(0,0,0,0.12)",
    "--sc-bg-image": bgImage,
    backgroundColor: t.background,
    backgroundImage: bgImage,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
    color: t.text_color,
    fontFamily: fontCss(t.font_style),
  };
}
