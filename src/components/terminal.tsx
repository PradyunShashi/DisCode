import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Text } from 'yjs'
import '@xterm/xterm/css/xterm.css'

function Terminal({ canControl, sharedOutput, height }: { canControl: boolean; sharedOutput: Text | null; height: number }) {
    const terminalRef = useRef<HTMLDivElement>(null)
    const terminalInstance = useRef<XTerm | null>(null)

    useEffect(() => {
        const term = new XTerm({ cursorBlink: true, disableStdin: !canControl })
        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(terminalRef.current!)
        terminalInstance.current = term
        const fitTerminal = () => {
            fitAddon.fit()
            if (canControl) window.api.resizeTerminal(term.cols, term.rows)
        }
        const resizeObserver = new ResizeObserver(fitTerminal)
        resizeObserver.observe(terminalRef.current!)
        requestAnimationFrame(fitTerminal)
        if (canControl) term.focus()

        let displayedOutput = sharedOutput?.toString() ?? ''
        if (displayedOutput) term.write(displayedOutput)

        const unsubscribe = canControl ? window.api.onTerminalOutput((data: string) => {
            term.write(data)
            if (sharedOutput) sharedOutput.insert(sharedOutput.length, data)
        }) : undefined

        const observeSharedOutput = () => {
            if (canControl || !sharedOutput) return
            const currentOutput = sharedOutput.toString()
            if (currentOutput.startsWith(displayedOutput)) {
                term.write(currentOutput.slice(displayedOutput.length))
            } else {
                term.clear()
                term.write(currentOutput)
            }
            displayedOutput = currentOutput
        }
        if (!canControl && sharedOutput) sharedOutput.observe(observeSharedOutput)

        const inputHandler = canControl ? term.onData((data) => window.api.sendTerminalInput(data)) : undefined

        return () => {
            unsubscribe?.()
            inputHandler?.dispose()
            resizeObserver.disconnect()
            if (!canControl && sharedOutput) sharedOutput.unobserve(observeSharedOutput)
            term.dispose()
            terminalInstance.current = null
        }
    }, [canControl, sharedOutput])

    return <div
        ref={terminalRef}
        className="terminal"
        style={{ height }}
        onPointerDown={() => { if (canControl) terminalInstance.current?.focus(); }}
    />
}

export default Terminal
