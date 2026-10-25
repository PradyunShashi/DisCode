import { app, BrowserWindow, dialog, ipcMain} from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { WebSocketServer } from 'ws'
import { setupCollaborationConnection } from './collaboration-server'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let collaborationServer: WebSocketServer | null = null
let collaborationPort: number | null = null

function getNetworkAddresses(port: number) {
  const addresses: string[] = []
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const network of interfaces ?? []) {
      if (network.family === 'IPv4' && !network.internal) {
        addresses.push(`ws://${network.address}:${port}`)
      }
    }
  }
  return addresses
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })
  startTerminal(win);

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)

ipcMain.handle("openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if(result.canceled){
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('browse-executable', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: process.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe', 'bat', 'cmd'] }, { name: 'All files', extensions: ['*'] }] : [],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle("openDirectory",async (_event, folderPath)=>{
  const entries = await fs.readdir(folderPath, {
    withFileTypes: true
  });
  return entries.map((entry)=>({
  name: entry.name,
  path: path.join(folderPath, entry.name),
  isDirectory: entry.isDirectory()
  }));
});

ipcMain.handle("readFile", async (_event, filePath) => {
    return await fs.readFile(filePath, "utf-8");
});

ipcMain.handle("writeFile",async (_event,filePath, content)=>{
  await fs.writeFile(filePath, content, "utf-8");
});

const ignoredWorkspaceFolders = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'release', '.discode-build'])
const ignoredWorkspaceFileNames = new Set(['desktop.ini', 'thumbs.db', 'ehthumbs.db', '.ds_store'])
const maxSharedFileBytes = 512 * 1024

ipcMain.handle('get-workspace-files', async (_event, folderPath: string) => {
  const files: { path: string; content: string }[] = []

  async function visit(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredWorkspaceFolders.has(entry.name)) await visit(path.join(currentPath, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      if (ignoredWorkspaceFileNames.has(entry.name.toLowerCase())) continue

      const absolutePath = path.join(currentPath, entry.name)
      if ((await fs.stat(absolutePath)).size > maxSharedFileBytes) continue
      try {
        files.push({
          path: path.relative(folderPath, absolutePath).split(path.sep).join('/'),
          content: await fs.readFile(absolutePath, 'utf-8'),
        })
      } catch {
        // Binary or inaccessible files are not shared as text documents.
      }
    }
  }

  await visit(folderPath)
  return files
})

import * as pty from 'node-pty'

let shell: pty.IPty | null = null

function startTerminal(mainWindow: BrowserWindow) {
    shell = pty.spawn('cmd.exe', [], {
        cols: 80,
        rows: 30,
        cwd: process.env.USERPROFILE,
        env: process.env as Record<string, string>
    })


    shell.onData((data) => {
        mainWindow.webContents.send('terminal-output', data)
    })
}

ipcMain.on('terminal-input', (_event, data: string) => {
    shell?.write(data)
})

ipcMain.on('terminal-resize', (_event, columns: number, rows: number) => {
  if (shell && columns > 0 && rows > 0) shell.resize(columns, rows)
})

ipcMain.on('terminal-message', (event, data: string) => {
  event.sender.send('terminal-output', `\r\n${data}\r\n`)
})

ipcMain.handle('run-shared-file', async (
  event,
  workspaceRoot: string,
  files: { path: string; content: string }[],
  entryPath: string,
  requestedToolchain: string,
  executablePath?: string,
) => {
  const root = path.resolve(workspaceRoot)
  const resolveWorkspaceFile = (relativePath: string) => {
    if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) throw new Error('Invalid workspace path')
    const resolved = path.resolve(root, relativePath)
    const fromRoot = path.relative(root, resolved)
    if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
      throw new Error('File is outside the selected workspace')
    }
    return resolved
  }

  const entryFile = resolveWorkspaceFile(entryPath)
  const extension = path.extname(entryFile).toLowerCase()
  const detectedToolchains: Record<string, string> = {
    '.js': 'node', '.cjs': 'node', '.mjs': 'node', '.py': 'python',
    '.c': 'gcc', '.cc': 'g++', '.cpp': 'g++', '.cxx': 'g++',
    '.java': 'javac', '.cs': 'dotnet', '.csproj': 'dotnet', '.go': 'go',
    '.rs': 'cargo',
  }
  const toolchain = requestedToolchain === 'auto' ? detectedToolchains[extension] : requestedToolchain
  if (!toolchain) throw new Error(`No automatic runner is configured for ${extension || 'this file type'}`)

  for (const file of files) {
    if (ignoredWorkspaceFileNames.has(path.basename(file.path).toLowerCase())) continue
    const target = resolveWorkspaceFile(file.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.content, 'utf-8')
  }

  const emit = (output: string) => event.sender.send('terminal-output', output)
  const startProcess = (
    command: string,
    args: string[],
    cwd: string,
    onComplete?: (success: boolean) => void,
  ) => {
    emit(`\r\n> ${command} ${args.map((argument) => `"${argument}"`).join(' ')}\r\n`)
    const child = spawn(command, args, { cwd, env: process.env, windowsHide: true })
    child.stdout.on('data', (data: Buffer) => emit(data.toString()))
    child.stderr.on('data', (data: Buffer) => emit(data.toString()))
    child.on('error', (error) => {
      emit(`\r\nFailed to start ${command}: ${error.message}\r\n`)
      onComplete?.(false)
    })
    child.on('close', (code) => {
      emit(`\r\n[Process exited${code === null ? '' : ` with code ${code}`} ]\r\n`)
      onComplete?.(code === 0)
    })
  }

  const compiler = executablePath || toolchain
  const buildDirectory = path.join(root, '.discode-build')
  await fs.mkdir(buildDirectory, { recursive: true })

  if (toolchain === 'node' || toolchain === 'python' || toolchain === 'go') {
    startProcess(compiler, [entryFile], root)
  } else if (toolchain === 'g++' || toolchain === 'clang++' || toolchain === 'gcc') {
    if (!['.c', '.cc', '.cpp', '.cxx'].includes(extension)) throw new Error(`${toolchain} needs a C or C++ source file`)
    const executable = path.join(buildDirectory, `${path.basename(entryFile, extension)}-${randomUUID()}${process.platform === 'win32' ? '.exe' : ''}`)
    startProcess(compiler, [entryFile, '-o', executable], root, (success) => {
      if (success) {
        startProcess(executable, [], root, () => { void fs.rm(executable, { force: true }).catch(() => undefined) })
      } else {
        void fs.rm(executable, { force: true }).catch(() => undefined)
      }
    })
  } else if (toolchain === 'javac') {
    if (extension !== '.java') throw new Error('Java (javac) needs a .java source file')
    const entry = files.find((file) => file.path === entryPath)
    const packageName = entry?.content.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1]
    const className = `${packageName ? `${packageName}.` : ''}${path.basename(entryFile, extension)}`
    const javaCommand = executablePath
      ? path.join(path.dirname(executablePath), process.platform === 'win32' ? 'java.exe' : 'java')
      : 'java'
    startProcess(compiler, ['-d', buildDirectory, entryFile], root, (success) => {
      if (success) startProcess(javaCommand, ['-cp', buildDirectory, className], root)
    })
  } else if (toolchain === 'dotnet') {
    const project = extension === '.csproj'
      ? entryFile
      : files.find((file) => file.path.toLowerCase().endsWith('.csproj'))?.path
    if (!project) throw new Error('No .csproj file is included in the shared workspace')
    startProcess(compiler, ['run', '--project', resolveWorkspaceFile(project)], root)
  } else if (toolchain === 'cargo') {
    startProcess(compiler, ['run'], root)
  } else {
    throw new Error(`Unknown toolchain: ${toolchain}`)
  }
  return true
})

ipcMain.handle('start-collaboration-server', async (_event, requestedPort = 1234) => {
  if (collaborationServer) {
    const port = collaborationPort ?? requestedPort
    return { port, addresses: getNetworkAddresses(port) }
  }

  const port = Number(requestedPort)
  collaborationServer = new WebSocketServer({ host: '0.0.0.0', port })
  collaborationServer.on('connection', (connection, request) => {
    const roomName = decodeURIComponent((request.url ?? '/').slice(1).split('?')[0])
    setupCollaborationConnection(connection, roomName)
  })
  await new Promise<void>((resolve, reject) => {
    const server = collaborationServer
    const onError = (error: Error) => {
      server?.off('listening', onListening)
      collaborationServer = null
      reject(error)
    }
    const onListening = () => {
      server?.off('error', onError)
      resolve()
    }
    server?.once('error', onError)
    server?.once('listening', onListening)
  })
  collaborationPort = port
  collaborationServer.on('error', (error) => console.error('Collaboration server error:', error))

  return { port, addresses: getNetworkAddresses(port) }
})

ipcMain.handle('stop-collaboration-server', async () => {
  if (!collaborationServer) return
  await new Promise<void>((resolve, reject) => {
    collaborationServer?.close((error) => error ? reject(error) : resolve())
  })
  collaborationServer = null
  collaborationPort = null
})
