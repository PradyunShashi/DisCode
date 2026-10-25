import { fileEntry } from '../types.ts'
import { ToolchainId } from '../types.ts'

export interface ElectronAPI {
    openFolder: () => Promise<string | null>
    openDirectory: (folderPath: string) => Promise<fileEntry[]>
    readFile: (filePath: string) => Promise<string>
    writeFile:(filePath:string, content:string) => Promise<void>
    getWorkspaceFiles: (folderPath: string) => Promise<{ path: string; content: string }[]>
    onTerminalOutput: (callback: (data: string) => void) => () => void
    sendTerminalInput: (data: string) => void
    resizeTerminal: (columns: number, rows: number) => void
    writeTerminalMessage: (data: string) => void
    browseExecutable: () => Promise<string | null>
    runSharedFile: (workspaceRoot: string, files: { path: string; content: string }[], entryPath: string, toolchain: ToolchainId, executablePath?: string) => Promise<boolean>
    startCollaborationServer: (port?: number) => Promise<{ port: number; addresses: string[] }>
    stopCollaborationServer: () => Promise<void>
}

declare global {
    interface Window {
        api: ElectronAPI
    }
}
