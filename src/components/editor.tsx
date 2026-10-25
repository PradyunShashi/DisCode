import MonacoEditor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

export type CollaborationSession = {
    serverUrl: string;
    roomId: string;
    displayName: string;
    color: string;
    isHost: boolean;
};

function languageForFile(fileName: string) {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const languages: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        json: 'json', html: 'html', css: 'css', scss: 'scss', md: 'markdown',
        py: 'python', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
        xml: 'xml', yml: 'yaml', yaml: 'yaml', sh: 'shell', sql: 'sql',
    };
    return languages[extension ?? ''] ?? 'plaintext';
}

function Editor({
    fileName,
    textContent,
    setTextContent,
    collaboration,
    sharedDocument,
    awareness,
    sharedPath,
    readOnly,
}: {
    fileName?: string;
    textContent: string;
    setTextContent: (value: string) => void;
    collaboration: CollaborationSession | null;
    sharedDocument: Y.Doc | null;
    awareness: Awareness | null;
    sharedPath?: string;
    readOnly: boolean;
}) {
    if (!fileName) {
        return (
            <div className="editor editor-placeholder">
                <div className="editor-placeholder-content">
                    <div className="editor-placeholder-mark">&lt;/&gt;</div>
                    <h2>Ready when you are</h2>
                    <p>Open a file from the explorer to start editing.</p>
                </div>
            </div>
        );
    }

    const collaborationKey = collaboration && sharedPath ? `${collaboration.roomId}:${sharedPath}` : undefined;

    return(
        <div className="editor" style={{ overflow: 'hidden' }}>
            <MonacoEditor
                key={collaborationKey ?? fileName}
                height="100%"
                width="100%"
                theme="vs-dark"
                language={languageForFile(fileName)}
                value={collaboration ? undefined : textContent}
                defaultValue={textContent}
                onChange={(value) => setTextContent(value ?? '')}
                onMount={(editor) => {
                    if (!collaboration || !sharedDocument || !awareness || !sharedPath || !editor.getModel()) return;

                    const sharedText = sharedDocument.getText(`file:${sharedPath}`);

                    const binding = new MonacoBinding(
                        sharedText,
                        editor.getModel()!,
                        new Set([editor]),
                        awareness,
                    );

                    const cursorStyles = document.createElement('style');
                    document.head.appendChild(cursorStyles);
                    const updateCursorStyles = () => {
                        cursorStyles.textContent = Array.from(awareness.getStates().entries())
                            .filter(([clientId]) => clientId !== sharedDocument.clientID)
                            .map(([clientId, state]) => {
                                const user = (state as { user?: { name?: string; color?: string } }).user;
                                const color = user?.color && /^#[\da-f]{6}$/i.test(user.color) ? user.color : '#60a5fa';
                                const name = JSON.stringify((user?.name || `Guest ${clientId}`).slice(0, 32));
                                return `
                                    .yRemoteSelection-${clientId} { background-color: ${color}44; border-bottom: 2px solid ${color}; }
                                    .yRemoteSelectionHead-${clientId} { position: relative; border-left: 2px solid ${color}; }
                                    .yRemoteSelectionHead-${clientId}::before,
                                    .yRemoteSelectionHead-${clientId}::after {
                                        content: ${name}; position: absolute; left: -2px; top: -1.5em;
                                        z-index: 20; padding: 1px 5px; border-radius: 3px;
                                        background: ${color}; color: white; font: 11px/1.4 sans-serif;
                                        white-space: nowrap; pointer-events: none;
                                    }
                                `;
                            }).join('\n');
                    };
                    awareness.on('change', updateCursorStyles);
                    updateCursorStyles();

                    editor.onDidDispose(() => {
                        binding.destroy();
                        awareness.off('change', updateCursorStyles);
                        cursorStyles.remove();
                    });
                }}
                options={{
                    readOnly,
                    fontSize: 14,
                    minimap: { enabled: true },
                    automaticLayout: true,
                    tabSize: 2,
                }}
            />
        </div>
    )
}

export default Editor;
