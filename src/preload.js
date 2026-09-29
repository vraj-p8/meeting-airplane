const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meetingAirplane', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  testOverlay: () => ipcRenderer.invoke('overlay:test'),
  getPlaneAsset: () => ipcRenderer.invoke('asset:plane'),
  selectPlaneSvg: () => ipcRenderer.invoke('asset:selectPlaneSvg'),
  getStartupStatus: () => ipcRenderer.invoke('startup:status'),
  setStartupEnabled: enabled => ipcRenderer.invoke('startup:set', enabled),
  getCalendarStatus: () => ipcRenderer.invoke('calendar:status'),
  selectCredentials: () => ipcRenderer.invoke('calendar:selectCredentials'),
  connectGoogle: () => ipcRenderer.invoke('calendar:connect'),
  disconnectGoogle: () => ipcRenderer.invoke('calendar:disconnect'),
  onOverlayPlay: callback => {
    ipcRenderer.removeAllListeners('overlay:play');
    ipcRenderer.on('overlay:play', (_event, payload) => callback(payload));
  },
  overlayDone: () => ipcRenderer.send('overlay:done')
});
