const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hwyDesktop", {
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  close: () => ipcRenderer.send("win:close"),
  setFullscreen: (value) => ipcRenderer.invoke("win:set-fullscreen", Boolean(value)),
  isFullscreen: () => ipcRenderer.invoke("win:is-fullscreen"),
  onFullscreenChange: (cb) => {
    const handler = (_event, value) => cb(Boolean(value));
    ipcRenderer.on("win:fullscreen-changed", handler);
    return () => ipcRenderer.removeListener("win:fullscreen-changed", handler);
  },
});
