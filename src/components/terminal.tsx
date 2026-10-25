import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

function Terminal() {
    const terminalRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const term = new XTerm({ cursorBlink: true })
        term.open(terminalRef.current!)

        window.api.onTerminalOutput((data: string) => {
            term.write(data)
        })

        term.onData((data) => {
            window.api.sendTerminalInput(data)
        })

        return () => {
            term.dispose()
        }
    }, [])

    return <div ref={terminalRef} className="terminal" style={{ height: '100%' }} />
}

export default Terminal