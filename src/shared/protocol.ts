export const CONNECTION_OPEN_PATH = '/api/connection.open'
export const CONNECTION_PEER_HEADER = 'x-dsh-connection-peer'
export const CONNECTION_RPC_METHOD = 'connection.rpc'
export const CONNECTION_CANCEL_METHOD = 'connection.cancel'

export const MAX_PENDING_CALLS = 256
export const MAX_SEND_QUEUE_BYTES = 8 * 1024 * 1024

export interface ReverseRpcPayload {
  channel: string
  endpoint: string
  payload: unknown
}

export interface RpcError {
  code: string
  message: string
  details: unknown
}

export type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RpcError }

export type ServerRequest =
  | {
      type: 'server-request'
      rpcId: string
      method: typeof CONNECTION_RPC_METHOD
      payload: ReverseRpcPayload
    }
  | {
      type: 'server-request'
      rpcId: string
      method: typeof CONNECTION_CANCEL_METHOD
      payload: null
    }

export interface ServerResponse {
  type: 'server-response'
  rpcId: string
  result: RpcResult<unknown>
}

export type ClientRequest =
  | {
      type: 'client-request'
      rpcId: string
      method: typeof CONNECTION_RPC_METHOD
      payload: ReverseRpcPayload
    }
  | {
      type: 'client-request'
      rpcId: string
      method: typeof CONNECTION_CANCEL_METHOD
      payload: null
    }

export interface ClientResponse {
  type: 'client-response'
  rpcId: string
  result: RpcResult<unknown>
}

export type ClientControlFrame = ClientRequest | ClientResponse
export type ServerControlFrame = ServerRequest | ServerResponse

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function rpcId(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function isReverseRpcPayload(value: unknown): value is ReverseRpcPayload {
  const candidate = record(value)
  return candidate !== undefined
    && typeof candidate.channel === 'string'
    && candidate.channel !== ''
    && typeof candidate.endpoint === 'string'
    && candidate.endpoint !== ''
    && Object.hasOwn(candidate, 'payload')
}

export function parseRpcResult(value: unknown): RpcResult<unknown> | undefined {
  const candidate = record(value)
  if (candidate?.ok === true) return { ok: true, value: candidate.value }
  if (candidate?.ok !== false) return undefined
  const error = record(candidate.error)
  if (error === undefined || typeof error.code !== 'string' || typeof error.message !== 'string'
    || !Object.hasOwn(error, 'details')) return undefined
  return {
    ok: false,
    error: { code: error.code, message: error.message, details: error.details },
  }
}

export function parseClientControlFrame(value: unknown): ClientControlFrame | undefined {
  const candidate = record(value)
  const id = rpcId(candidate?.rpcId)
  if (candidate === undefined || id === undefined) return undefined
  if (candidate.type === 'client-response') {
    const result = parseRpcResult(candidate.result)
    return result === undefined ? undefined : { type: 'client-response', rpcId: id, result }
  }
  if (candidate.type !== 'client-request') return undefined
  if (candidate.method === CONNECTION_CANCEL_METHOD && candidate.payload === null) {
    return { type: 'client-request', rpcId: id, method: CONNECTION_CANCEL_METHOD, payload: null }
  }
  if (candidate.method === CONNECTION_RPC_METHOD && isReverseRpcPayload(candidate.payload)) {
    return { type: 'client-request', rpcId: id, method: CONNECTION_RPC_METHOD, payload: candidate.payload }
  }
  return undefined
}

export function parseServerControlFrame(value: unknown): ServerControlFrame | undefined {
  const candidate = record(value)
  const id = rpcId(candidate?.rpcId)
  if (candidate === undefined || id === undefined) return undefined
  if (candidate.type === 'server-response') {
    const result = parseRpcResult(candidate.result)
    return result === undefined ? undefined : { type: 'server-response', rpcId: id, result }
  }
  if (candidate.type !== 'server-request') return undefined
  if (candidate.method === CONNECTION_CANCEL_METHOD && candidate.payload === null) {
    return { type: 'server-request', rpcId: id, method: CONNECTION_CANCEL_METHOD, payload: null }
  }
  if (candidate.method === CONNECTION_RPC_METHOD && isReverseRpcPayload(candidate.payload)) {
    return { type: 'server-request', rpcId: id, method: CONNECTION_RPC_METHOD, payload: candidate.payload }
  }
  return undefined
}

export function isTbodServerFrame(value: unknown): boolean {
  const candidate = record(value)
  return candidate?.type === 'server-response'
    || (candidate?.type === 'server-request'
      && (candidate.method === CONNECTION_RPC_METHOD || candidate.method === CONNECTION_CANCEL_METHOD))
}

export function internalFailure(error: unknown): RpcResult<never> {
  return {
    ok: false,
    error: {
      code: 'internal',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}
