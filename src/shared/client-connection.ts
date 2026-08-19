import type {} from '@deepseek-ai/dsh-client-connection/client'
import {
  CONNECTION_CANCEL_METHOD,
  CONNECTION_OPEN_PATH,
  CONNECTION_PEER_HEADER,
  CONNECTION_RESPOND_PATH,
  CONNECTION_RPC_HEADER,
  CONNECTION_RPC_METHOD,
  internalFailure,
  isReverseRpcPayload,
  type ClientResponse,
  type RpcResult,
  type ServerRequest,
} from './protocol.js'

export type ClientConnectionHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<RpcResult<unknown>>

export interface ClientConnectionGeneration {
  readonly id: string
}

export interface ClientConnectionBinding {
  readonly intercept: (
    channel: string,
    matches: (endpoint: string) => boolean,
    handler: ClientConnectionHandler,
  ) => () => void
  open(signal?: AbortSignal): Promise<ClientConnectionGeneration>
  release(generation: ClientConnectionGeneration | undefined): void
  handle(message: ServerRequest, generation: ClientConnectionGeneration | undefined): boolean
}

interface Registration {
  channel: string
  matches: (endpoint: string) => boolean
  handler: ClientConnectionHandler
  active: Set<AbortController>
}

interface ActiveGeneration extends ClientConnectionGeneration {
  closed: boolean
  invocations: Map<string, AbortController>
}

export interface ClientConnectionBindingOptions {
  fetch?: typeof globalThis.fetch
  baseUrl?: () => string
}

const INTERNAL_BASE = 'http://dsh.internal'

export function createClientConnectionBinding(
  options: ClientConnectionBindingOptions = {},
): ClientConnectionBinding {
  const fetch = options.fetch ?? globalThis.fetch
  const baseUrl = options.baseUrl ?? (() => {
    const location = globalThis.location
    return location?.origin !== undefined && location.origin !== 'null'
      ? location.origin
      : INTERNAL_BASE
  })
  const registrations = new Set<Registration>()
  let current: ActiveGeneration | undefined
  let opening: Promise<ActiveGeneration> | undefined

  const close = (generation: ActiveGeneration): void => {
    if (generation.closed) return
    generation.closed = true
    if (current === generation) current = undefined
    for (const controller of generation.invocations.values()) {
      controller.abort(new Error('Connection generation closed'))
    }
    generation.invocations.clear()
  }

  const respond = async (generation: ActiveGeneration, message: ClientResponse): Promise<void> => {
    if (generation.closed) return
    const response = await fetch(new URL(CONNECTION_RESPOND_PATH, baseUrl()), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CONNECTION_PEER_HEADER]: generation.id,
        [CONNECTION_RPC_HEADER]: message.rpcId,
      },
      body: JSON.stringify(message),
    })
    if (!response.ok) throw new Error(`Connection response failed with HTTP ${response.status}`)
  }

  const dispatch = async (
    generation: ActiveGeneration,
    message: ServerRequest,
  ): Promise<void> => {
    if (!isReverseRpcPayload(message.payload)) return
    const request = message.payload
    const registration = [...registrations].find(candidate => (
      candidate.channel === request.channel && candidate.matches(request.endpoint)
    ))
    const controller = new AbortController()
    generation.invocations.set(message.rpcId, controller)
    registration?.active.add(controller)
    let result: RpcResult<unknown>
    try {
      result = registration === undefined
        ? internalFailure(`No Client Connection handler owns ${request.channel}/${request.endpoint}`)
        : await registration.handler(request.endpoint, request.payload, controller.signal)
    } catch (error) {
      result = internalFailure(error)
    } finally {
      registration?.active.delete(controller)
    }
    if (generation.invocations.get(message.rpcId) !== controller) return
    generation.invocations.delete(message.rpcId)
    try {
      await respond(generation, {
        type: 'client-response',
        rpcId: message.rpcId,
        result,
      })
    } catch {
      close(generation)
    }
  }

  return {
    intercept(channel, matches, handler) {
      const registration = { channel, matches, handler, active: new Set<AbortController>() }
      registrations.add(registration)
      return () => {
        registrations.delete(registration)
        for (const controller of registration.active) {
          controller.abort(new Error('Client Connection handler disposed'))
        }
        registration.active.clear()
      }
    },
    async open(signal) {
      if (current !== undefined && !current.closed) return current
      opening ??= (async () => {
        const response = await fetch(new URL(CONNECTION_OPEN_PATH, baseUrl()), {
          method: 'POST',
          signal,
        })
        if (!response.ok) throw new Error(`Connection open failed with HTTP ${response.status}`)
        const body = await response.json() as { id?: unknown }
        if (typeof body.id !== 'string' || body.id === '') throw new Error('Connection open returned no peer id')
        const generation: ActiveGeneration = {
          id: body.id,
          closed: false,
          invocations: new Map(),
        }
        current = generation
        return generation
      })().finally(() => {
        opening = undefined
      })
      return opening
    },
    release(generation) {
      if (generation !== undefined && current === generation) close(current)
    },
    handle(message, generation) {
      const active = current
      if (generation === undefined || active === undefined || active !== generation || active.closed) return false
      if (message.method === CONNECTION_CANCEL_METHOD) {
        active.invocations.get(message.rpcId)?.abort(new Error('Remote call cancelled'))
        active.invocations.delete(message.rpcId)
        return true
      }
      if (message.method !== CONNECTION_RPC_METHOD) return false
      void dispatch(active, message)
      return true
    },
  }
}

declare module '@deepseek-ai/dsh-client-connection/client' {
  interface ClientConnectionRpc {
    intercept(
      channel: string,
      matches: (endpoint: string) => boolean,
      handler: ClientConnectionHandler,
    ): () => void
  }
}
