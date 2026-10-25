import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('api',{
  openFolder:()=>ipcRenderer.invoke("openFolder"),

  openDirectory: (folderPath: string) =>ipcRenderer.invoke("openDirectory", folderPath),

  readFile: (filePath: string) =>ipcRenderer.invoke("readFile",filePath),

  writeFile: (filePath: string, content: string) =>ipcRenderer.invoke("writeFile", filePath, content),
  browseExecutable: () => ipcRenderer.invoke('browse-executable'),
  getWorkspaceFiles: (folderPath: string) => ipcRenderer.invoke('get-workspace-files', folderPath),
  onTerminalOutput: (callback: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on('terminal-output', listener)
    return () => ipcRenderer.removeListener('terminal-output', listener)
  },
  sendTerminalInput: (data: string) => {
      ipcRenderer.send('terminal-input', data)
  },
  resizeTerminal: (columns: number, rows: number) => ipcRenderer.send('terminal-resize', columns, rows),
  writeTerminalMessage: (data: string) => ipcRenderer.send('terminal-message', data),
  startCollaborationServer: (port?: number) => ipcRenderer.invoke('start-collaboration-server', port),
  stopCollaborationServer: () => ipcRenderer.invoke('stop-collaboration-server'),
  runSharedFile: (workspaceRoot: string, files: { path: string; content: string }[], entryPath: string, toolchain: string, executablePath?: string) =>
    ipcRenderer.invoke('run-shared-file', workspaceRoot, files, entryPath, toolchain, executablePath),
});
