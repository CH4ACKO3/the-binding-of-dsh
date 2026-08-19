import { randomUUID } from 'node:crypto'
import type {} from '@deepseek-ai/dsh-client-connection'
import { clientResponseSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema'
import {
  CONNECTION_CANCEL_METHOD,
  CONNECTION_OPEN_PATH,
  CONNECTION_PEER_HEADER,
  CONNECTION_RESPOND_PATH,
  CONNECTION_RPC_HEADER,
  CONNECTION_RPC_METHOD,
  type ClientResponse,
  type RpcResult,
  type ServerRequest,
} from '../shared/protocol.js'

export interface ConnectionPeer {
  readonly id: string
  readonly kind: 'browser' | 'node'
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<unknown>>
}

export type PeerChange =
  | { type: 'added'; peer: ConnectionPeer }
  | { type: 'removed'; peer: ConnectionPeer }

export interface HostConnectionPeers {
  get(id: string): ConnectionPeer | undefined
  list(): readonly ConnectionPeer[]
  subscribe(listener: (change: PeerChange) => void): () => void
}

interface SocketLike {
  readonly readyState: number
  send(data: string, callback: (error?: Error | null) => void): void
  close(code?: number, reason?: string): void
  once(event: 'close' | 'error', listener: () => void): void
}

interface PendingCall {
  resolve(result: RpcResult<unknown>): void
  reject(error: unknown): void
  dispose(): void
}

interface Generation {
  id: string
  kind: 'browser' | 'node'
  failed: boolean
  mux?: SocketLike
  host?: SocketLike
  peer?: ConnectionPeer
  pending: Map<string, PendingCall>
}

const sendQueues = new WeakMap<object, Promise<void>>()

export function sendConnectionMessage(socket: SocketLike, message: ServerRequest): Promise<void> {
  const previous = sendQueues.get(socket) ?? Promise.resolve()
  const next = previous.then(() => new Promise<void>((resolve, reject) => {
    if (socket.readyState !== 1) return reject(new Error('WebSocket downlink is closed'))
    socket.send(JSON.stringify(message), error => error == null ? resolve() : reject(error))
  }))
  sendQueues.set(socket, next)
  return next
}

export interface ReverseConnectionHost {
  readonly peers: HostConnectionPeers
  fetch(request: Request): Promise<Response> | undefined
  attach(kind: 'mux' | 'host', request: { headers: Record<string, unknown> }, socket: SocketLike): boolean
  dispose(): void
}

export class HostConnectionBinding implements ReverseConnectionHost {
  private readonly generations = new Map<string, Generation>()
  private readonly published = new Map<string, ConnectionPeer>()
  private readonly listeners = new Set<(change: PeerChange) => void>()

  readonly peers: HostConnectionPeers = {
    get: id => this.published.get(id),
    list: () => [...this.published.values()],
    subscribe: listener => {
      this.listeners.add(listener)
      return () => this.listeners.delete(listener)
    },
  }

  fetch(request: Request): Promise<Response> | undefined {
    const path = new URL(request.url).pathname
    if (path === CONNECTION_OPEN_PATH) return this.open(request)
    if (path !== CONNECTION_RESPOND_PATH) return undefined
    const id = request.headers.get(CONNECTION_PEER_HEADER)
    const generation = id === null ? undefined : this.generations.get(id)
    if (generation === undefined || generation.failed) return undefined
    const rpcId = request.headers.get(CONNECTION_RPC_HEADER)
    if (rpcId === null || !generation.pending.has(rpcId)) return undefined
    return this.respond(generation, request)
  }

  attach(
    kind: 'mux' | 'host',
    request: { headers: Record<string, unknown> },
    socket: SocketLike,
  ): boolean {
    const header = request.headers['sec-websocket-protocol']
    const id = typeof header === 'string' ? header.split(',', 1)[0]?.trim() : undefined
    const generation = id === undefined ? undefined : this.generations.get(id)
    if (generation === undefined || generation.failed || generation[kind] !== undefined) {
      socket.close(1008, 'invalid connection peer')
      return false
    }
    generation[kind] = socket
    const failed = (): void => this.fail(generation, new Error('Connection generation closed'))
    socket.once('close', failed)
    socket.once('error', failed)
    if (generation.mux !== undefined && generation.host !== undefined) this.publish(generation)
    return true
  }

  dispose(): void {
    for (const generation of [...this.generations.values()]) {
      this.fail(generation, new Error('Connection service disposed'))
    }
    this.listeners.clear()
  }

  private async open(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
    const id = randomUUID()
    this.generations.set(id, {
      id,
      kind: request.headers.get('content-type')?.startsWith('application/json') === true
        && (await request.json() as { kind?: unknown }).kind === 'node'
        ? 'node'
        : 'browser',
      failed: false,
      pending: new Map(),
    })
    return Response.json({ id })
  }

  private async respond(generation: Generation, request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ accepted: false, reason: 'bad-response' })
    }
    const parsed = clientResponseSchema.safeParse(body)
    if (!parsed.success) return Response.json({ accepted: false, reason: 'bad-response' })
    const message = parsed.data as ClientResponse
    if (message.rpcId !== request.headers.get(CONNECTION_RPC_HEADER)) {
      return Response.json({ accepted: false, reason: 'bad-response' })
    }
    const pending = generation.pending.get(message.rpcId)
    if (pending === undefined) return Response.json({ accepted: false, reason: 'not-pending' })
    generation.pending.delete(message.rpcId)
    pending.dispose()
    pending.resolve(message.result)
    return Response.json({ accepted: true })
  }

  private publish(generation: Generation): void {
    if (generation.peer !== undefined || generation.failed) return
    const peer: ConnectionPeer = {
      id: generation.id,
      kind: generation.kind,
      call: (channel, endpoint, payload, signal) => this.call(generation, channel, endpoint, payload, signal),
    }
    generation.peer = peer
    this.published.set(peer.id, peer)
    this.emit({ type: 'added', peer })
  }

  private call(
    generation: Generation,
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<RpcResult<unknown>> {
    if (generation.failed || generation.host === undefined || generation.peer === undefined) {
      return Promise.reject(new Error('Connection peer is not active'))
    }
    if (signal?.aborted === true) return Promise.reject(signal.reason)
    const rpcId = randomUUID()
    return new Promise((resolve, reject) => {
      const aborted = (): void => {
        const pending = generation.pending.get(rpcId)
        if (pending === undefined) return
        generation.pending.delete(rpcId)
        pending.dispose()
        reject(signal?.reason)
        void sendConnectionMessage(generation.host!, {
          type: 'server-request',
          rpcId,
          method: CONNECTION_CANCEL_METHOD,
          payload: null,
        }).catch(() => undefined)
      }
      const pending: PendingCall = {
        resolve,
        reject,
        dispose: () => signal?.removeEventListener('abort', aborted),
      }
      generation.pending.set(rpcId, pending)
      signal?.addEventListener('abort', aborted, { once: true })
      void sendConnectionMessage(generation.host!, {
        type: 'server-request',
        rpcId,
        method: CONNECTION_RPC_METHOD,
        payload: { channel, endpoint, payload },
      }).catch(error => this.fail(generation, error))
    })
  }

  private fail(generation: Generation, error: unknown): void {
    if (generation.failed) return
    generation.failed = true
    this.generations.delete(generation.id)
    if (generation.peer !== undefined) {
      this.published.delete(generation.id)
      this.emit({ type: 'removed', peer: generation.peer })
    }
    for (const pending of generation.pending.values()) {
      pending.dispose()
      pending.reject(error)
    }
    generation.pending.clear()
    for (const socket of [generation.mux, generation.host]) {
      if (socket !== undefined && (socket.readyState === 0 || socket.readyState === 1)) socket.close()
    }
  }

  private emit(change: PeerChange): void {
    for (const listener of [...this.listeners]) listener(change)
  }
}

declare module '@deepseek-ai/dsh-client-connection' {
  interface HostConnectionHandle {
    readonly peers: HostConnectionPeers
  }
}
