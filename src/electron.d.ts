import { fileEntry } from '../types.ts'

export interface ElectronAPI {
    openFolder: () => Promise<string | null>
    openDirectory: (folderPath: string) => Promise<fileEntry[]>
    readFile: (filePath: string) => Promise<string>
    writeFile:(filePath:string, content:string) => Promise<void>
    onTerminalOutput: (callback: (data: string) => void) => void
    sendTerminalInput: (data: string) => void
}

declare global {
    interface Window {
        api: ElectronAPI
    }
}