import { fileEntry } from '../types.ts'

export interface ElectronAPI {
    openFolder: () => Promise<string | null>
    openDirectory: (folderPath: string) => Promise<fileEntry[]>
}

declare global {
    interface Window {
        api: ElectronAPI
    }
}