import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('threeBodyDesktop', {
  platform: process.platform,
});
