import { fileEntry } from '../types.ts'
import { CollaborationSession } from './editor.tsx'
import { useEffect, useRef, useState } from 'react'
import { ToolchainId } from '../types.ts'

const compilerOptions: { id: ToolchainId; label: string }[] = [
    { id: 'auto', label: 'Auto detect' },
    { id: 'node', label: 'Node.js' },
    { id: 'python', label: 'Python' },
    { id: 'gcc', label: 'GCC (C)' },
    { id: 'g++', label: 'G++ (C++)' },
    { id: 'clang++', label: 'Clang++' },
    { id: 'javac', label: 'Java (JDK)' },
    { id: 'dotnet', label: '.NET' },
    { id: 'go', label: 'Go' },
    { id: 'cargo', label: 'Rust (Cargo)' },
];



function Topbar({
    setFilesInFolder,
    onWorkspaceOpened,
    collaboration,
    setCollaboration,
    collaborators,
    guestPermissions,
    setGuestEditing,
    canRun,
    onRun,
    toolchain,
    toolchainPaths,
    onToolchainChange,
    onBrowseToolchain,
}: {
    setFilesInFolder: React.Dispatch<React.SetStateAction<fileEntry[]>>;
    onWorkspaceOpened: (folderPath: string) => void;
    collaboration: CollaborationSession | null;
    setCollaboration: React.Dispatch<React.SetStateAction<CollaborationSession | null>>;
    collaborators: { id: string; name: string; color: string; isHost: boolean }[];
    guestPermissions: Record<string, boolean>;
    setGuestEditing: (clientId: string, allowed: boolean) => void;
    canRun: boolean;
    onRun: () => void;
    toolchain: ToolchainId;
    toolchainPaths: Partial<Record<ToolchainId, string>>;
    onToolchainChange: (toolchain: ToolchainId) => void;
    onBrowseToolchain: () => void;
})
{
    const [serverUrl, setServerUrl] = useState('ws://localhost:1234');
    const [roomId, setRoomId] = useState('discode-room');
    const [displayName, setDisplayName] = useState('Anonymous');
    const [hostAddresses, setHostAddresses] = useState<string[]>([]);
    const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
    const [compilerPickerOpen, setCompilerPickerOpen] = useState(false);
    const [compilerSearch, setCompilerSearch] = useState('');
    const collaboratorsMenuRef = useRef<HTMLDivElement>(null);
    const compilerPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!collaboratorsOpen) return;
        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!collaboratorsMenuRef.current?.contains(event.target as Node)) setCollaboratorsOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setCollaboratorsOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [collaboratorsOpen]);

    useEffect(() => {
        if (!compilerPickerOpen) return;
        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!compilerPickerRef.current?.contains(event.target as Node)) setCompilerPickerOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setCompilerPickerOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [compilerPickerOpen]);

    useEffect(() => {
        if (!collaboration) setCollaboratorsOpen(false);
    }, [collaboration]);

    const selectedToolchain = compilerOptions.find((option) => option.id === toolchain) ?? compilerOptions[0];
    const selectedExecutablePath = toolchainPaths[toolchain];
    const selectedPathName = selectedExecutablePath?.split(/[\\/]/).pop();
    let filteredCompilerOptions = compilerOptions;
    if (compilerSearch) {
        try {
            const matcher = new RegExp(compilerSearch, 'i');
            filteredCompilerOptions = compilerOptions.filter((option) => matcher.test(`${option.label} ${option.id}`));
        } catch {
            filteredCompilerOptions = [];
        }
    }
    const showPathOption = !compilerSearch || filteredCompilerOptions.length === 0;
    async function fileButton(){
        console.log("button clicked");
        const folderPath = await window.api.openFolder();
        if(!folderPath) return;
        const entries = await window.api.openDirectory(folderPath);
        setFilesInFolder(entries);
        onWorkspaceOpened(folderPath);
    console.log(entries);
    }

    function connect() {
        if (!roomId.trim() || !serverUrl.trim()) return;
        const palette = ['#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf', '#fb7185', '#4ade80'];
        const usedColors = new Set(collaborators.map((person) => person.color.toLowerCase()));
        const color = palette.find((candidate) => !usedColors.has(candidate.toLowerCase())) ?? palette[Math.floor(Math.random() * palette.length)];
        setCollaboration({
            serverUrl: serverUrl.trim(),
            roomId: roomId.trim(),
            displayName: displayName.trim() || 'Anonymous',
            color,
            isHost: false,
        });
    }

    async function host() {
        const details = await window.api.startCollaborationServer(1234);
        setHostAddresses(details.addresses);
        setServerUrl(`ws://localhost:${details.port}`);
        setCollaboration({
            serverUrl: `ws://localhost:${details.port}`,
            roomId: roomId.trim() || 'discode-room',
            displayName: displayName.trim() || 'Host',
            color: '#34d399',
            isHost: true,
        });
    }

    async function disconnect() {
        setCollaboration(null);
        setHostAddresses([]);
        await window.api.stopCollaborationServer();
    }
    return(
        <div className = "topbar">
            <button onClick={fileButton}>File</button>
            <button>Edit</button>
            <div className="run-controls">
                <div className="compiler-picker" ref={compilerPickerRef}>
                    <input
                        className="compiler-picker-input"
                        aria-label="Search compilers"
                        aria-expanded={compilerPickerOpen}
                        aria-controls="compiler-picker-options"
                        role="combobox"
                        value={compilerPickerOpen ? compilerSearch : `${selectedToolchain.label}${selectedPathName ? ` · ${selectedPathName}` : ''}`}
                        placeholder="Search compilers…"
                        title={selectedExecutablePath ?? 'Uses the selected toolchain from PATH'}
                        onFocus={() => {
                            setCompilerSearch('');
                            setCompilerPickerOpen(true);
                        }}
                        onClick={() => setCompilerPickerOpen(true)}
                        onChange={(event) => {
                            setCompilerSearch(event.target.value);
                            setCompilerPickerOpen(true);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && filteredCompilerOptions.length === 1) {
                                onToolchainChange(filteredCompilerOptions[0].id);
                                setCompilerPickerOpen(false);
                                setCompilerSearch('');
                            }
                        }}
                    />
                    {compilerPickerOpen && (
                        <div className="compiler-picker-options" id="compiler-picker-options" role="listbox">
                            {filteredCompilerOptions.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="option"
                                    aria-selected={option.id === toolchain}
                                    className={option.id === toolchain ? 'compiler-option selected' : 'compiler-option'}
                                    onClick={() => {
                                        onToolchainChange(option.id);
                                        setCompilerPickerOpen(false);
                                        setCompilerSearch('');
                                    }}
                                >
                                    <span>{option.label}</span>
                                    <small>{toolchainPaths[option.id] ?? (option.id === 'auto' ? 'Choose by file type' : 'Uses PATH')}</small>
                                </button>
                            ))}
                            {filteredCompilerOptions.length === 0 && compilerSearch && (
                                <div className="compiler-no-results">No compiler matches that pattern.</div>
                            )}
                            {showPathOption && (
                                <button
                                    type="button"
                                    className="compiler-option compiler-path-option"
                                    onClick={() => {
                                        setCompilerPickerOpen(false);
                                        setCompilerSearch('');
                                        void onBrowseToolchain();
                                    }}
                                >
                                    <span>Browse executable path…</span>
                                    <small>Choose a compiler or runtime file</small>
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <button onClick={onRun} disabled={!canRun} title={canRun ? 'Save shared edits on the host and run this file' : 'Open a shared file as the host to run it'}>Run</button>
            </div>
            <div className="collaboration-controls">
                <input aria-label="Your name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" />
                <input aria-label="Room ID" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="Room ID" />
                <input aria-label="WebSocket URL" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="ws://host:1234" />
                {collaboration ? (
                    <button onClick={disconnect}>Leave session</button>
                ) : (
                    <>
                        <button onClick={host}>Host session</button>
                        <button onClick={connect}>Join session</button>
                    </>
                )}
                {collaboration && (
                    <div className="collaborators-menu" ref={collaboratorsMenuRef}>
                        <button aria-expanded={collaboratorsOpen} onClick={() => setCollaboratorsOpen((open) => !open)}>
                            Collaborators ({collaborators.length})
                        </button>
                        {collaboratorsOpen && (
                            <section className="collaborators-popover" aria-label="Session collaborators">
                                <div className="collaborators-popover-title">People in this session</div>
                                {collaborators.length === 0 ? (
                                    <div className="guest-permission-empty">Connecting…</div>
                                ) : collaborators.map((person) => (
                                    <div className="collaborator-row" key={person.id}>
                                        <span className="guest-color-dot" style={{ backgroundColor: person.color }} />
                                        <span className="collaborator-name">{person.name}</span>
                                        <span className={`collaborator-role ${person.isHost ? 'host-role' : ''}`}>
                                            {person.isHost ? 'Host' : 'Collaborator'}
                                        </span>
                                        {collaboration.isHost && !person.isHost && (
                                            <label className="collaborator-edit-control">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(guestPermissions[person.id])}
                                                    onChange={(event) => setGuestEditing(person.id, event.target.checked)}
                                                />
                                                Can edit
                                            </label>
                                        )}
                                        {!collaboration.isHost && !person.isHost && (
                                            <span className="collaborator-view-permission">
                                                {guestPermissions[person.id] ? 'Can edit' : 'View only'}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </section>
                        )}
                    </div>
                )}
            </div>
            {hostAddresses.length > 0 && (
                <div className="host-addresses" title="Share one of these addresses with collaborators">
                    Hosting: {hostAddresses.join(' or ')}
                </div>
            )}
        </div>

    )
}

export default Topbar
