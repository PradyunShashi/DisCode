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
  onTerminalOutput: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal-output', (_event, data) => callback(data))
  },
  sendTerminalInput: (data: string) => {
      ipcRenderer.send('terminal-input', data)
  }
});
