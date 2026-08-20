import assert from 'node:assert/strict'
import test from 'node:test'
import { HostConnectionBinding } from '../lib/host/connection.js'
import { createClientConnectionBinding } from '../lib/shared/client-connection.js'

class FakeSocket {
  readyState = 1
  sent = []
  listeners = new Map()

  send(data, callback) {
    this.sent.push(JSON.parse(data))
    queueMicrotask(() => callback())
  }

  close() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.emit('close')
  }

  once(event, listener) {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
  }

  emit(event) {
    const listeners = this.listeners.get(event) ?? []
    this.listeners.delete(event)
    for (const listener of listeners) listener()
  }
}

async function openPeer(binding) {
  const response = await binding.fetch(new Request('http://dsh.test/api/connection.open', { method: 'POST' }))
  const { id } = await response.json()
  const mux = new FakeSocket()
  const host = new FakeSocket()
  const request = { headers: { 'sec-websocket-protocol': id } }
  assert.equal(binding.attach('mux', request, mux), true)
  assert.equal(binding.attach('host', request, host), true)
  return { id, mux, host, peer: binding.peers.get(id) }
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve))
}

test('Host targets one peer and settles its correlated response', async () => {
  const binding = new HostConnectionBinding()
  const first = await openPeer(binding)
  const second = await openPeer(binding)
  assert.ok(first.peer)
  assert.ok(second.peer)

  const call = first.peer.call('/api', 'echo/run', { value: 1 })
  await settle()
  assert.equal(first.host.sent.length, 1)
  assert.equal(second.host.sent.length, 0)
  const request = first.host.sent[0]
  assert.equal(request.method, 'connection.rpc')
  assert.deepEqual(request.payload, {
    channel: '/api',
    endpoint: 'echo/run',
    payload: { value: 1 },
  })

  const receipt = await binding.fetch(new Request('http://dsh.test/api/respond', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dsh-connection-peer': first.id,
      'x-dsh-connection-rpc': request.rpcId,
    },
    body: JSON.stringify({
      type: 'client-response',
      rpcId: request.rpcId,
      result: { ok: true, value: 2 },
    }),
  }))
  assert.deepEqual(await receipt.json(), { accepted: true })
  assert.deepEqual(await call, { ok: true, value: 2 })
})

test('Host cancellation and generation loss reject pending calls', async () => {
  const binding = new HostConnectionBinding()
  const active = await openPeer(binding)
  const controller = new AbortController()
  const cancelled = active.peer.call('/api', 'jobs/run', {}, controller.signal)
  await settle()
  controller.abort(new Error('caller cancelled'))
  await assert.rejects(cancelled, /caller cancelled/)
  await settle()
  assert.equal(active.host.sent.at(-1).method, 'connection.cancel')

  const disconnected = active.peer.call('/api', 'jobs/run', {})
  await settle()
  active.mux.close()
  await assert.rejects(disconnected, /generation closed/)
  assert.equal(binding.peers.get(active.id), undefined)
  assert.equal(active.host.readyState, 3)
})

test('Client dispatches reverse calls and returns through the response leg', async () => {
  const responses = []
  let opens = 0
  const binding = createClientConnectionBinding({
    baseUrl: () => 'http://dsh.test',
    fetch: async (input, init) => {
      const path = new URL(input).pathname
      if (path === '/api/connection.open') {
        opens += 1
        return Response.json({ id: 'peer-1' })
      }
      responses.push({
        peer: init.headers['x-dsh-connection-peer'],
        rpcId: init.headers['x-dsh-connection-rpc'],
        message: JSON.parse(init.body),
      })
      return Response.json({ accepted: true })
    },
  })
  binding.intercept('/api', endpoint => endpoint === 'echo/run', async (_endpoint, payload) => ({
    ok: true,
    value: payload.value + 1,
  }))
  const [generation, sameGeneration] = await Promise.all([binding.open(), binding.open()])
  assert.equal(generation, sameGeneration)
  assert.equal(opens, 1)
  assert.equal(binding.handle({
    type: 'server-request',
    rpcId: 'rpc-1',
    method: 'connection.rpc',
    payload: { channel: '/api', endpoint: 'echo/run', payload: { value: 1 } },
  }, generation), true)
  await settle()
  assert.deepEqual(responses, [{
    peer: 'peer-1',
    rpcId: 'rpc-1',
    message: {
      type: 'client-response',
      rpcId: 'rpc-1',
      result: { ok: true, value: 2 },
    },
  }])
})

test('Client cancellation aborts the active handler without responding', async () => {
  const responses = []
  let handlerSignal
  const binding = createClientConnectionBinding({
    baseUrl: () => 'http://dsh.test',
    fetch: async (input, init) => {
      if (new URL(input).pathname === '/api/connection.open') return Response.json({ id: 'peer-1' })
      responses.push(init)
      return Response.json({ accepted: true })
    },
  })
  binding.intercept('/api', () => true, async (_endpoint, _payload, signal) => {
    handlerSignal = signal
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    return { ok: true, value: null }
  })
  const generation = await binding.open()
  binding.handle({
    type: 'server-request',
    rpcId: 'rpc-1',
    method: 'connection.rpc',
    payload: { channel: '/api', endpoint: 'jobs/run', payload: {} },
  }, generation)
  binding.handle({
    type: 'server-request',
    rpcId: 'rpc-1',
    method: 'connection.cancel',
    payload: null,
  }, generation)
  await settle()
  assert.equal(handlerSignal.aborted, true)
  assert.equal(responses.length, 0)
})

test('disposing a Client registration aborts its active handlers', async () => {
  let handlerSignal
  const binding = createClientConnectionBinding({
    baseUrl: () => 'http://dsh.test',
    fetch: async input => new URL(input).pathname === '/api/connection.open'
      ? Response.json({ id: 'peer-1' })
      : Response.json({ accepted: true }),
  })
  const dispose = binding.intercept('/api', () => true, async (_endpoint, _payload, signal) => {
    handlerSignal = signal
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    throw signal.reason
  })
  const generation = await binding.open()
  binding.handle({
    type: 'server-request',
    rpcId: 'rpc-1',
    method: 'connection.rpc',
    payload: { channel: '/api', endpoint: 'jobs/run', payload: {} },
  }, generation)
  dispose()
  await settle()
  assert.equal(handlerSignal.aborted, true)
})
