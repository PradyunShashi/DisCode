import { fileEntry, tab} from '../types.ts'
import { useState } from 'react'

function File_explorer({
    filesInFolder,
    setActiveTab,
    setTabs,
    sharedFiles,
    collaborationActive,
    onSharedFileOpen,
    workspaceStatus,
    connectionStatus,
    explorerWidth,
}: {
    filesInFolder: fileEntry[];
    setActiveTab: (path: string) => void;
    setTabs: React.Dispatch<React.SetStateAction<Record<string, tab>>>;
    sharedFiles: string[];
    collaborationActive: boolean;
    onSharedFileOpen: (path: string) => void;
    workspaceStatus: string;
    connectionStatus: 'connecting' | 'connected' | 'disconnected';
    explorerWidth: number;
}){
    type SharedNode = { name: string; path: string; directory: boolean; children: Map<string, SharedNode> };
    const [expandedFolder, setExpandedFolder] = useState<string[]>([]);
    const [expandedSharedFolder, setExpandedSharedFolder] = useState<string[]>([]);
    const [folderContents, setFolderContents] = useState<Record<string, fileEntry[]>>({});
    function renderFiles(files:fileEntry[],depth = 0)
    {
        return files.map(file=>(
                <div key = {file.path} style = {{marginLeft: `${depth*5}px`}}>
                   <button className = "fileNameButton" onClick={()=>fileClicker(file)}>{file.name}</button>
                   {
                    file.isDirectory&&
                    expandedFolder.includes(file.path)&&
                    folderContents[file.path]&&(
                        <div className = "childrenFiles">
                            {renderFiles(folderContents[file.path],depth+1)}
                        </div>)
                   }
                </div>
            ))
    } 
    async function fileClicker(file:fileEntry)
    {
        if(file.isDirectory)
        {
            if(expandedFolder.includes(file.path)){
                setExpandedFolder(expandedFolder.filter(path=>path!=file.path))
                return null;
            }
            else {
                setExpandedFolder([...expandedFolder,file.path]);
                const entries = await window.api.openDirectory(file.path);
                console.log(entries);
                setFolderContents({...folderContents,[file.path]:entries})
            }
        }
        else{
            let content = await window.api.readFile(file.path);
            setTabs(prevTabs => ({
                ...prevTabs,
                [file.path]:{
                    tabName:file.name,
                    content: content
                }
            }));
            setActiveTab(file.path);
        };
    }

    function renderSharedFiles() {
        if (!collaborationActive) return null;
        if (sharedFiles.length === 0) return (
            <div className="shared-workspace">
                <div className="shared-workspace-title">Shared workspace</div>
                <div className={`collaboration-status status-${connectionStatus}`}>{connectionStatus}</div>
                <p className="shared-workspace-empty">{workspaceStatus || 'Waiting for the host to share a folder…'}</p>
            </div>
        );
        const roots = new Map<string, SharedNode>();
        for (const filePath of sharedFiles) {
            const parts = filePath.split('/').filter(Boolean);
            let current = roots;
            let accumulated = '';
            parts.forEach((part, index) => {
                accumulated = accumulated ? `${accumulated}/${part}` : part;
                const isDirectory = index < parts.length - 1;
                let node = current.get(part);
                if (!node) {
                    node = { name: part, path: accumulated, directory: isDirectory, children: new Map() };
                    current.set(part, node);
                }
                current = node.children;
            });
        }

        const renderNodes = (nodes: Map<string, SharedNode>) => Array.from(nodes.values()).map((node) => (
            <div key={node.path}>
                <button
                    className={`fileNameButton shared-file ${node.directory ? 'shared-directory' : ''}`}
                    onClick={() => {
                        if (!node.directory) {
                            onSharedFileOpen(node.path);
                            return;
                        }
                        setExpandedSharedFolder((previous) => previous.includes(node.path)
                            ? previous.filter((path) => path !== node.path)
                            : [...previous, node.path]);
                    }}
                >
                    {node.directory ? (expandedSharedFolder.includes(node.path) ? '▾ ' : '▸ ') : '  '}{node.name}
                </button>
                {node.directory && expandedSharedFolder.includes(node.path) && (
                    <div className="childrenFiles">{renderNodes(node.children)}</div>
                )}
            </div>
        ));

        return (
            <div className="shared-workspace">
                <div className="shared-workspace-title">Shared workspace</div>
                <div className={`collaboration-status status-${connectionStatus}`}>{connectionStatus}</div>
                {workspaceStatus && <div className="shared-workspace-status">{workspaceStatus}</div>}
                {renderNodes(roots)}
            </div>
        );
    }
    return (
        <div className="file_explorer" style={{ width: explorerWidth, flexBasis: explorerWidth }}>
            {collaborationActive ? renderSharedFiles() : renderFiles(filesInFolder)}
        </div>
    )
}

export default File_explorer
