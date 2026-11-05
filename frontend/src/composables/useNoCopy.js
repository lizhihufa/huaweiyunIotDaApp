import { onMounted, onUnmounted } from "vue";

/**
 * 在指定根元素上禁止选中与复制（Ctrl+C / 右键复制等）
 */
export function useNoCopy(rootRef) {
  function block(e) {
    e.preventDefault();
    return false;
  }

  /** 布局拖拽模式下不拦截选中，避免影响卡片拖动/缩放 */
  function blockSelect(e) {
    if (rootRef?.value?.classList?.contains("layout-editing")) return;
    return block(e);
  }

  function onKeyDown(e) {
    const key = String(e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (key === "c" || key === "x" || key === "a")) {
      // 输入框内仍允许全选/复制，方便改标题、颜色等
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) {
        return;
      }
      e.preventDefault();
    }
  }

  onMounted(() => {
    const el = rootRef?.value;
    if (!el) return;
    el.addEventListener("copy", block);
    el.addEventListener("cut", block);
    el.addEventListener("contextmenu", block);
    el.addEventListener("selectstart", blockSelect);
    el.addEventListener("keydown", onKeyDown);
  });

  onUnmounted(() => {
    const el = rootRef?.value;
    if (!el) return;
    el.removeEventListener("copy", block);
    el.removeEventListener("cut", block);
    el.removeEventListener("contextmenu", block);
    el.removeEventListener("selectstart", blockSelect);
    el.removeEventListener("keydown", onKeyDown);
  });
}
