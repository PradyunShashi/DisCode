import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { WebSocket, type RawData } from 'ws'

const messageSync = 0
const messageAwareness = 1

type SharedDocument = Y.Doc & {
  connections: Set<WebSocket>
  awareness: awarenessProtocol.Awareness
}

const documents = new Map<string, SharedDocument>()

function send(connection: WebSocket, message: Uint8Array) {
  if (connection.readyState === WebSocket.OPEN) connection.send(message)
}

function getDocument(name: string): SharedDocument {
  const existing = documents.get(name)
  if (existing) return existing

  const document = new Y.Doc() as SharedDocument
  document.connections = new Set()
  document.awareness = new awarenessProtocol.Awareness(document)
  document.awareness.setLocalState(null)
  document.on('update', (update: Uint8Array) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageSync)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    document.connections.forEach((connection) => send(connection, message))
  })
  document.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(document.awareness, added.concat(updated, removed)),
    )
    const message = encoding.toUint8Array(encoder)
    document.connections.forEach((connection) => send(connection, message))
  })
  documents.set(name, document)
  return document
}

function toUint8Array(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return Buffer.concat(data)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

export function setupCollaborationConnection(connection: WebSocket, roomName: string) {
  const document = getDocument(roomName)
  const awarenessClients = new Set<number>()
  document.connections.add(connection)

  connection.on('message', (rawMessage: RawData) => {
    try {
      const decoder = decoding.createDecoder(toUint8Array(rawMessage))
      const messageType = decoding.readVarUint(decoder)
      if (messageType === messageSync) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        syncProtocol.readSyncMessage(decoder, encoder, document, connection)
        if (encoding.length(encoder) > 1) send(connection, encoding.toUint8Array(encoder))
      } else if (messageType === messageAwareness) {
        const update = decoding.readVarUint8Array(decoder)
        const clientsDecoder = decoding.createDecoder(update)
        const count = decoding.readVarUint(clientsDecoder)
        for (let index = 0; index < count; index += 1) {
          awarenessClients.add(decoding.readVarUint(clientsDecoder))
          decoding.readVarUint(clientsDecoder)
          decoding.readVarString(clientsDecoder)
        }
        awarenessProtocol.applyAwarenessUpdate(document.awareness, update, connection)
      }
    } catch (error) {
      console.error('Invalid collaboration message:', error)
      connection.close(1003, 'Invalid collaboration message')
    }
  })

  connection.on('close', () => {
    document.connections.delete(connection)
    awarenessProtocol.removeAwarenessStates(document.awareness, Array.from(awarenessClients), null)
    if (document.connections.size === 0) {
      document.awareness.destroy()
      document.destroy()
      documents.delete(roomName)
    }
  })

  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, document)
  send(connection, encoding.toUint8Array(encoder))

  const awarenessStates = document.awareness.getStates()
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder()
    encoding.writeVarUint(awarenessEncoder, messageAwareness)
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(document.awareness, Array.from(awarenessStates.keys())),
    )
    send(connection, encoding.toUint8Array(awarenessEncoder))
  }
}
