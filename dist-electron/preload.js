"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  openExternal: (url) => electron_1.ipcRenderer.invoke("open-external", url),
});
