import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
});
