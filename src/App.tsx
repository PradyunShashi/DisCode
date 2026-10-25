import { useState, useEffect, useCallback, useRef } from 'react'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import Editor, { CollaborationSession } from './components/editor.tsx'
import File_explorer from './components/file_explorer.tsx'
import Terminal from './components/terminal.tsx'
import Topbar from './components/topbar.tsx'
import Tab_bar from './components/tab_bar.tsx'
import {tab, ToolchainId} from './types.ts'

import './App.css'

function App() {

  //takes the files from the user for clicking the file button
  const[filesInFolder,setFilesInFolder] = useState<{
    name: string,
    path: string,
    isDirectory: boolean,
  }[]>([])

  const[tabs, setTabs] = useState<Record<string, tab>>({});

  const [activeTab, setActiveTab] = useState<string>("");
  const [collaboration, setCollaboration] = useState<CollaborationSession | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [sharedDocument, setSharedDocument] = useState<Y.Doc | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [sharedFiles, setSharedFiles] = useState<string[]>([]);
  const [workspaceStatus, setWorkspaceStatus] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [documentSynced, setDocumentSynced] = useState(false);
  const [guestPermissions, setGuestPermissions] = useState<Record<string, boolean>>({});
  const [workspaceCandidates, setWorkspaceCandidates] = useState<{ path: string; content: string }[] | null>(null);
  const [selectedReviewFiles, setSelectedReviewFiles] = useState<Set<string>>(new Set());
  const [workspaceReviewRequested, setWorkspaceReviewRequested] = useState(false);
  const [collaborators, setCollaborators] = useState<{ id: string; name: string; color: string; isHost: boolean }[]>([]);
  const [toolchain, setToolchain] = useState<ToolchainId>('auto');
  const [toolchainPaths, setToolchainPaths] = useState<Partial<Record<ToolchainId, string>>>({});
  const [explorerWidth, setExplorerWidth] = useState(250);
  const [terminalHeight, setTerminalHeight] = useState(300);
  const explorerDrag = useRef<{ startX: number; startWidth: number } | null>(null);
  const terminalDrag = useRef<{ startY: number; startHeight: number } | null>(null);

  const currentTab = tabs[activeTab];
  const localToSharedPath = useCallback((filePath: string) => {
    if (!workspaceRoot) return undefined;
    const normalizedRoot = workspaceRoot.split('\\').join('/').replace(/\/$/, '');
    const normalizedFile = filePath.split('\\').join('/');
    if (!normalizedFile.startsWith(`${normalizedRoot}/`)) return undefined;
    return normalizedFile.slice(normalizedRoot.length + 1);
  }, [workspaceRoot]);

  const activeSharedPath = currentTab?.sharedPath ?? localToSharedPath(activeTab);
  const canRunActiveFile = Boolean(
    workspaceRoot && currentTab && activeSharedPath &&
    (!collaboration || collaboration.isHost) &&
    (!collaboration || sharedFiles.includes(activeSharedPath)),
  );

  const openSharedFile = useCallback((sharedPath: string) => {
    if (!sharedDocument) return;
    const tabId = `shared:${sharedPath}`;
    setTabs((previous) => ({
      ...previous,
      [tabId]: {
        tabName: sharedPath.split('/').at(-1) ?? sharedPath,
        content: sharedDocument.getText(`file:${sharedPath}`).toString(),
        sharedPath,
      },
    }));
    setActiveTab(tabId);
  }, [sharedDocument]);

  useEffect(() => {
    if (!workspaceRoot) return;
    try {
      const saved = localStorage.getItem(`discode:run-profile:${workspaceRoot.toLowerCase()}`);
      if (!saved) {
        setToolchain('auto');
        setToolchainPaths({});
        return;
      }
      const settings = JSON.parse(saved) as { toolchain?: ToolchainId; paths?: Partial<Record<ToolchainId, string>> };
      const known: ToolchainId[] = ['auto', 'node', 'python', 'gcc', 'g++', 'clang++', 'javac', 'dotnet', 'go', 'cargo'];
      setToolchain(settings.toolchain && known.includes(settings.toolchain) ? settings.toolchain : 'auto');
      setToolchainPaths(settings.paths ?? {});
    } catch {
      setToolchain('auto');
      setToolchainPaths({});
    }
  }, [workspaceRoot]);

  function persistRunProfile(nextToolchain: ToolchainId, nextPaths: Partial<Record<ToolchainId, string>>) {
    if (!workspaceRoot) return;
    localStorage.setItem(`discode:run-profile:${workspaceRoot.toLowerCase()}`, JSON.stringify({ toolchain: nextToolchain, paths: nextPaths }));
  }

  function handleToolchainChange(nextToolchain: ToolchainId) {
    setToolchain(nextToolchain);
    persistRunProfile(nextToolchain, toolchainPaths);
  }

  async function browseToolchain() {
    const selectedPath = await window.api.browseExecutable();
    if (!selectedPath) return;
    let targetToolchain = toolchain;
    if (targetToolchain === 'auto') {
      const executableName = selectedPath.split(/[\\/]/).pop()?.toLowerCase() ?? '';
      const executableMatches: [RegExp, ToolchainId][] = [
        [/^node(?:\.exe)?$/, 'node'],
        [/^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/, 'python'],
        [/^gcc(?:\.exe)?$/, 'gcc'],
        [/^g\+\+(?:\.exe)?$/, 'g++'],
        [/^clang\+\+(?:\.exe)?$/, 'clang++'],
        [/^javac(?:\.exe)?$/, 'javac'],
        [/^dotnet(?:\.exe)?$/, 'dotnet'],
        [/^go(?:\.exe)?$/, 'go'],
        [/^cargo(?:\.exe)?$/, 'cargo'],
      ];
      targetToolchain = executableMatches.find(([pattern]) => pattern.test(executableName))?.[1] ?? 'auto';
      if (targetToolchain === 'auto') {
        const extension = activeSharedPath?.split('.').pop()?.toLowerCase();
        const extensionToolchains: Record<string, ToolchainId> = {
          js: 'node', cjs: 'node', mjs: 'node', py: 'python', c: 'gcc',
          cc: 'g++', cpp: 'g++', cxx: 'g++', java: 'javac', cs: 'dotnet',
          csproj: 'dotnet', go: 'go', rs: 'cargo',
        };
        targetToolchain = extensionToolchains[extension ?? ''] ?? 'auto';
      }
    }
    if (targetToolchain === 'auto') {
      window.api.writeTerminalMessage('Could not identify a toolchain from that executable. Select a compiler first, then browse for its path.');
      return;
    }

    const nextPaths = { ...toolchainPaths, [targetToolchain]: selectedPath };
    setToolchain(targetToolchain);
    setToolchainPaths(nextPaths);
    persistRunProfile(targetToolchain, nextPaths);
  }

  useEffect(() => {
    if (!collaboration) {
      setSharedDocument(null);
      setAwareness(null);
      setSharedFiles([]);
      setWorkspaceStatus('');
      setConnectionStatus('disconnected');
      setDocumentSynced(false);
      setWorkspaceReviewRequested(false);
      setWorkspaceCandidates(null);
      setCollaborators([]);
      return;
    }
    const document = new Y.Doc();
    const provider = new WebsocketProvider(collaboration.serverUrl, collaboration.roomId, document);
    provider.on('status', ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) => setConnectionStatus(status));
    provider.on('sync', (synced: boolean) => setDocumentSynced(synced));
    provider.awareness.setLocalStateField('user', {
      name: collaboration.displayName,
      color: collaboration.color,
      isHost: collaboration.isHost,
    });
    setSharedDocument(document);
    setAwareness(provider.awareness);

    return () => {
      provider.destroy();
      document.destroy();
    };
  }, [collaboration]);

  useEffect(() => {
    if (!sharedDocument) return;
    const fileIndex = sharedDocument.getMap<boolean>('files');
    const settings = sharedDocument.getMap<unknown>('settings');
    const refreshFiles = () => setSharedFiles(Array.from(fileIndex.keys()).sort());
    const refreshSettings = () => {
      const value = settings.get('guestPermissions');
      setGuestPermissions(value && typeof value === 'object' ? value as Record<string, boolean> : {});
    };
    fileIndex.observe(refreshFiles);
    settings.observe(refreshSettings);
    refreshFiles();
    refreshSettings();
    return () => {
      fileIndex.unobserve(refreshFiles);
      settings.unobserve(refreshSettings);
    };
  }, [sharedDocument]);

  useEffect(() => {
    if (!sharedDocument || !collaboration?.isHost || !workspaceRoot || !documentSynced || workspaceReviewRequested) return;
    let cancelled = false;
    setWorkspaceStatus('Preparing files for review…');
    window.api.getWorkspaceFiles(workspaceRoot).then((files) => {
      if (cancelled) return;
      const defaults = files.filter(({ path: filePath }) => {
        const name = filePath.split('/').pop() ?? filePath;
        return !name.startsWith('.') && !/(secret|credential|private|\.pem$|\.key$)/i.test(name);
      });
      setWorkspaceCandidates(files);
      setWorkspaceReviewRequested(true);
      setSelectedReviewFiles(new Set(defaults.map(({ path: filePath }) => filePath)));
      setWorkspaceStatus('Review files before sharing');
    }).catch((error: unknown) => {
      console.error('Unable to share workspace:', error);
      if (!cancelled) setWorkspaceStatus('Could not read the selected folder');
    });
    return () => { cancelled = true; };
  }, [sharedDocument, collaboration?.isHost, workspaceRoot, documentSynced, workspaceReviewRequested]);

  useEffect(() => {
    if (!awareness) return;
    const refreshCollaborators = () => setCollaborators(Array.from(awareness.getStates().entries())
      .map(([id, state]) => {
        const user = (state as { user?: { name?: string; color?: string; isHost?: boolean } }).user;
        return {
          id: String(id),
          name: user?.name || `Guest ${id}`,
          color: user?.color || '#60a5fa',
          isHost: id === awareness.clientID ? Boolean(collaboration?.isHost) : Boolean(user?.isHost),
        };
      }));
    awareness.on('change', refreshCollaborators);
    refreshCollaborators();
    return () => { awareness.off('change', refreshCollaborators); };
  }, [awareness, collaboration?.isHost]);

  function setGuestEditing(clientId: string, allowed: boolean) {
    if (!sharedDocument || !collaboration?.isHost) return;
    const permissions = { ...guestPermissions, [clientId]: allowed };
    sharedDocument.getMap<unknown>('settings').set('guestPermissions', permissions);
    setGuestPermissions(permissions);
  }

  function publishReviewedFiles() {
    if (!sharedDocument || !workspaceCandidates) return;
    const selected = workspaceCandidates.filter(({ path: filePath }) => selectedReviewFiles.has(filePath));
    const fileIndex = sharedDocument.getMap<boolean>('files');
    sharedDocument.transact(() => {
      for (const path of Array.from(fileIndex.keys())) fileIndex.delete(path);
      for (const file of selected) {
        fileIndex.set(file.path, true);
        const sharedText = sharedDocument.getText(`file:${file.path}`);
        if (sharedText.length === 0 && file.content) sharedText.insert(0, file.content);
      }
    });
    setWorkspaceStatus(`${selected.length} files shared`);
    setWorkspaceCandidates(null);
  }

  function handleWorkspaceOpened(folderPath: string) {
    setWorkspaceRoot(folderPath);
    setWorkspaceReviewRequested(false);
    setWorkspaceCandidates(null);
    setSharedFiles([]);
  }

  function resizeExplorer(event: React.PointerEvent<HTMLDivElement>) {
    const drag = explorerDrag.current;
    if (drag) setExplorerWidth(Math.min(500, Math.max(160, drag.startWidth + event.clientX - drag.startX)));
  }

  function resizeTerminal(event: React.PointerEvent<HTMLDivElement>) {
    const drag = terminalDrag.current;
    if (drag) {
      const maximum = Math.max(160, window.innerHeight - 220);
      setTerminalHeight(Math.min(maximum, Math.max(120, drag.startHeight + drag.startY - event.clientY)));
    }
  }

  async function runActiveFile() {
    if (!canRunActiveFile || !workspaceRoot || !activeSharedPath || !currentTab) return;
    if (collaboration && !collaboration.isHost) return;

    const filesToWrite = collaboration && sharedDocument
      ? sharedFiles.map((filePath) => ({
          path: filePath,
          content: sharedDocument.getText(`file:${filePath}`).toString(),
        }))
      : [{ path: activeSharedPath, content: currentTab.content }];

    try {
      await window.api.runSharedFile(workspaceRoot, filesToWrite, activeSharedPath, toolchain, toolchainPaths[toolchain]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.api.writeTerminalMessage(message);
    }
  }

  // called when Editor content changes
  function handleEditorChange(newContent: string) {
      setTabs(prevTabs => ({
          ...prevTabs,
          [activeTab]: {
              ...prevTabs[activeTab],
              content: newContent
          }
      }))
  }
  
  // Ctrl+S
async function saveFile() {
    if (!activeTab || !currentTab || currentTab.sharedPath || (collaboration && !collaboration.isHost)) return
    await window.api.writeFile(activeTab, currentTab.content)
}

useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault()
            saveFile()
        }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
}, [activeTab, tabs])
    

  return (
   <>
   <div className = "app">
    <Topbar 
    setFilesInFolder={setFilesInFolder}
    onWorkspaceOpened={handleWorkspaceOpened}
    collaboration={collaboration}
    setCollaboration={setCollaboration}
    collaborators={collaborators}
    guestPermissions={guestPermissions}
    setGuestEditing={setGuestEditing}
    canRun={canRunActiveFile}
    onRun={runActiveFile}
    toolchain={toolchain}
    toolchainPaths={toolchainPaths}
    onToolchainChange={handleToolchainChange}
    onBrowseToolchain={browseToolchain}
    />

    <div className="workspace">
    <File_explorer 
    filesInFolder={filesInFolder}
    setTabs = {setTabs}
    setActiveTab = {setActiveTab}
    sharedFiles={sharedFiles}
    collaborationActive={Boolean(collaboration)}
    workspaceStatus={workspaceStatus}
    connectionStatus={connectionStatus}
    explorerWidth={explorerWidth}
    onSharedFileOpen={openSharedFile}/>

    <div
      className="resize-handle resize-handle-vertical"
      role="separator"
      aria-label="Resize file explorer"
      aria-orientation="vertical"
      aria-valuenow={explorerWidth}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        explorerDrag.current = { startX: event.clientX, startWidth: explorerWidth };
      }}
      onPointerMove={resizeExplorer}
      onPointerUp={() => { explorerDrag.current = null; }}
      onPointerCancel={() => { explorerDrag.current = null; }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') setExplorerWidth((width) => Math.max(160, width - 16));
        if (event.key === 'ArrowRight') setExplorerWidth((width) => Math.min(500, width + 16));
      }}
    />

    <div className = "editor-terminal">
      <Tab_bar 
      tabs = {tabs}
      setActiveTab = {setActiveTab}
      setTabs = {setTabs}/>

      <Editor 
      fileName={currentTab?.tabName}
      textContent = {currentTab?.content ?? ""}
      setTextContent = {handleEditorChange}
      collaboration={collaboration}
      sharedDocument={sharedDocument}
      awareness={awareness}
      sharedPath={currentTab?.sharedPath ?? (collaboration?.isHost ? localToSharedPath(activeTab) : undefined)}
      readOnly={Boolean(collaboration && !collaboration.isHost && !guestPermissions[String(awareness?.clientID)])}
      />
      <div
        className="resize-handle resize-handle-horizontal"
        role="separator"
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        aria-valuenow={terminalHeight}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          terminalDrag.current = { startY: event.clientY, startHeight: terminalHeight };
        }}
        onPointerMove={resizeTerminal}
        onPointerUp={() => { terminalDrag.current = null; }}
        onPointerCancel={() => { terminalDrag.current = null; }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') setTerminalHeight((height) => Math.min(Math.max(160, window.innerHeight - 220), height + 16));
          if (event.key === 'ArrowDown') setTerminalHeight((height) => Math.max(120, height - 16));
        }}
      />
      <Terminal
        canControl={!collaboration || collaboration.isHost}
        sharedOutput={collaboration ? sharedDocument?.getText('terminalOutput') ?? null : null}
        height={terminalHeight}
      />
    </div>
    </div>
    {collaboration?.isHost && workspaceCandidates && (
      <div className="file-review-backdrop">
        <section className="file-review-dialog" role="dialog" aria-modal="true" aria-labelledby="file-review-title">
          <h2 id="file-review-title">Review files to share</h2>
          <p>Only checked files are shared with this room. Hidden files and files with secret-like names start unchecked.</p>
          <div className="file-review-list">
            {workspaceCandidates.map((file) => (
              <label key={file.path}>
                <input type="checkbox" checked={selectedReviewFiles.has(file.path)} onChange={(event) => {
                  setSelectedReviewFiles((previous) => {
                    const next = new Set(previous);
                    if (event.target.checked) next.add(file.path); else next.delete(file.path);
                    return next;
                  });
                }} />
                <span>{file.path}</span>
              </label>
            ))}
          </div>
          <div className="file-review-actions">
            <button onClick={() => { setWorkspaceCandidates(null); setWorkspaceStatus('Sharing cancelled'); }}>Cancel</button>
            <button onClick={publishReviewedFiles}>Share {selectedReviewFiles.size} files</button>
          </div>
        </section>
      </div>
    )}
   </div>
   </>
  )

}

export default App
