/** 建造操作撤销 / 重做 */

export function createBuildHistory(limit = 60) {
  let past = [];
  let future = [];

  function snapshot(props) {
    return JSON.parse(JSON.stringify(props || []));
  }

  function push(props) {
    past.push(snapshot(props));
    if (past.length > limit) past.shift();
    future = [];
  }

  function undo(current) {
    if (!past.length) return null;
    future.push(snapshot(current));
    return past.pop();
  }

  function redo(current) {
    if (!future.length) return null;
    past.push(snapshot(current));
    return future.pop();
  }

  function clear() {
    past = [];
    future = [];
  }

  return {
    push,
    undo,
    redo,
    clear,
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}
