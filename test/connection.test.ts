import assert from 'node:assert/strict'
import test from 'node:test'
import { createHostFetchDispatcher, HostConnectionBinding } from '../lib/host/connection.js'
import { createClientConnectionBinding } from '../lib/shared/client-connection.js'

class FakeSocket {
  readyState = 1
  bufferedAmount = 0
  sent = []
  listeners = new Map()
  onceListeners = new Map()

  send(data, callback = () => undefined) {
    this.sent.push(JSON.parse(data))
    queueMicrotask(() => callback())
  }

  close() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.emit('close')
  }

  on(event, listener) {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
  }

  addEventListener(event, listener, options) {
    if (options?.once === true) this.once(event, listener)
    else this.on(event, listener)
  }

  once(event, listener) {
    const listeners = this.onceListeners.get(event) ?? []
    listeners.push(listener)
    this.onceListeners.set(event, listeners)
  }

  emit(event, value) {
    for (const listener of this.listeners.get(event) ?? []) listener(value)
    const once = this.onceListeners.get(event) ?? []
    this.onceListeners.delete(event)
    for (const listener of once) listener(value)
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

test('Host targets one peer and settles its correlated WebSocket response', async () => {
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
  first.host.emit('message', JSON.stringify({
    type: 'client-response',
    rpcId: request.rpcId,
    result: { ok: true, value: 2 },
  }))
  assert.deepEqual(await call, { ok: true, value: 2 })
})

test('Host dispatches Client calls and cancellation over the host WebSocket', async () => {
  const binding = new HostConnectionBinding()
  let dispatchSignal
  binding.setDispatcher(async (request, _headers, signal) => {
    dispatchSignal = signal
    if (request.payload.endpoint === 'wait') {
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    }
    return { ok: true, value: request.payload.payload }
  })
  const active = await openPeer(binding)
  active.host.emit('message', JSON.stringify({
    type: 'client-request',
    rpcId: 'client-1',
    method: 'connection.rpc',
    payload: { channel: '/api', endpoint: 'echo', payload: 3 },
  }))
  await settle()
  assert.deepEqual(active.host.sent.at(-1), {
    type: 'server-response',
    rpcId: 'client-1',
    result: { ok: true, value: 3 },
  })

  active.host.emit('message', JSON.stringify({
    type: 'client-request',
    rpcId: 'client-2',
    method: 'connection.rpc',
    payload: { channel: '/api', endpoint: 'wait', payload: null },
  }))
  await settle()
  active.host.emit('message', JSON.stringify({
    type: 'client-request',
    rpcId: 'client-2',
    method: 'connection.cancel',
    payload: null,
  }))
  await settle()
  assert.equal(dispatchSignal.aborted, true)
  assert.equal(active.host.sent.filter(frame => frame.rpcId === 'client-2').length, 0)
})

test('fetch dispatcher reuses the native request envelope and upgrade headers', async () => {
  let received
  const dispatcher = createHostFetchDispatcher({
    async fetch(request) {
      received = {
        path: new URL(request.url).pathname,
        origin: request.headers.get('origin'),
        body: await request.json(),
        signal: request.signal,
      }
      return Response.json({
        type: 'server-response',
        rpcId: received.body.rpcId,
        result: { ok: true, value: 'native' },
      })
    },
  })
  const controller = new AbortController()
  assert.deepEqual(await dispatcher({
    type: 'client-request',
    rpcId: 'rpc-native',
    method: 'connection.rpc',
    payload: { channel: '/api', endpoint: 'fleet/list', payload: { args: {} } },
  }, { origin: 'http://127.0.0.1:3081' }, controller.signal), { ok: true, value: 'native' })
  assert.equal(received.path, '/api/fleet/list')
  assert.equal(received.origin, 'http://127.0.0.1:3081')
  assert.equal(received.signal.aborted, false)
  assert.deepEqual(received.body, {
    type: 'client-request',
    rpcId: 'rpc-native',
    method: 'fleet/list',
    payload: { args: {} },
  })
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

test('Client completes calls and reverse calls on the attached host WebSocket', async () => {
  let opens = 0
  const binding = createClientConnectionBinding({
    baseUrl: () => 'http://dsh.test',
    fetch: async input => {
      assert.equal(new URL(input).pathname, '/api/connection.open')
      opens += 1
      return Response.json({ id: 'peer-1' })
    },
  })
  binding.intercept('/api', endpoint => endpoint === 'echo/run', async (_endpoint, payload) => ({
    ok: true,
    value: payload.value + 1,
  }))
  const [generation, sameGeneration] = await Promise.all([binding.open(), binding.open()])
  assert.equal(generation, sameGeneration)
  assert.equal(opens, 1)
  const socket = new FakeSocket()
  binding.attach(generation, 'host', socket)

  const outbound = binding.call('/api', 'echo/host', { value: 1 })
  await settle()
  const request = socket.sent.at(-1)
  binding.handle({
    type: 'server-response',
    rpcId: request.rpcId,
    result: { ok: true, value: 2 },
  }, generation)
  assert.deepEqual(await outbound, { ok: true, value: 2 })

  assert.equal(binding.handle({
    type: 'server-request',
    rpcId: 'rpc-1',
    method: 'connection.rpc',
    payload: { channel: '/api', endpoint: 'echo/run', payload: { value: 2 } },
  }, generation), true)
  await settle()
  assert.deepEqual(socket.sent.at(-1), {
    type: 'client-response',
    rpcId: 'rpc-1',
    result: { ok: true, value: 3 },
  })
})

test('Client calls wait for generation creation and the host WebSocket to open', async () => {
  const binding = createClientConnectionBinding({ fetch: async () => Response.json({ id: 'peer-1' }) })
  const call = binding.call('/api', 'echo/run', { value: 1 })
  await settle()
  const generation = await binding.open()
  const socket = new FakeSocket()
  socket.readyState = 0
  binding.attach(generation, 'host', socket)
  await settle()
  assert.equal(socket.sent.length, 0)
  socket.readyState = 1
  socket.emit('open')
  await settle()
  const request = socket.sent[0]
  binding.handle({
    type: 'server-response',
    rpcId: request.rpcId,
    result: { ok: true, value: 2 },
  }, generation)
  assert.deepEqual(await call, { ok: true, value: 2 })
})

test('Client cancellation aborts both RPC directions', async () => {
  let handlerSignal
  const binding = createClientConnectionBinding({
    fetch: async () => Response.json({ id: 'peer-1' }),
  })
  binding.intercept('/api', () => true, async (_endpoint, _payload, signal) => {
    handlerSignal = signal
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    return { ok: true, value: null }
  })
  const generation = await binding.open()
  const socket = new FakeSocket()
  binding.attach(generation, 'host', socket)
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
  assert.equal(socket.sent.length, 0)

  const controller = new AbortController()
  const outbound = binding.call('/api', 'jobs/run', {}, controller.signal)
  await settle()
  controller.abort(new Error('client cancelled'))
  await assert.rejects(outbound, /client cancelled/)
  assert.equal(socket.sent.at(-1).method, 'connection.cancel')
})

test('malformed TBOD frames close the generation while native host frames remain unclaimed', async () => {
  const binding = createClientConnectionBinding({ fetch: async () => Response.json({ id: 'peer-1' }) })
  const generation = await binding.open()
  const socket = new FakeSocket()
  binding.attach(generation, 'host', socket)
  assert.equal(binding.handle({
    type: 'server-request',
    rpcId: 'native-1',
    method: 'events.host',
    payload: {},
  }, generation), false)
  assert.equal(binding.handle({
    type: 'server-response',
    rpcId: '',
    result: { ok: true },
  }, generation), true)
  assert.equal(socket.readyState, 3)
})
