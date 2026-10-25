export type fileEntry = {
    name: string,
    path: string,
    isDirectory: boolean,
}

export type tab = {
    tabName: string,
    content: string,
    sharedPath?: string,
}

export type ToolchainId = 'auto' | 'node' | 'python' | 'g++' | 'clang++' | 'gcc' | 'javac' | 'dotnet' | 'go' | 'cargo'
