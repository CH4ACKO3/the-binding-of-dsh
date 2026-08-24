import assert from 'node:assert/strict'
import test from 'node:test'
import { BrowserPeerClient } from '../lib/browser-peer-client.js'

const stringCodec = {
  mode: 'strict',
  typeSymbol: 'string',
  schema: {
    parse(value) {
      if (typeof value !== 'string') throw new TypeError('expected string')
      return value
    },
  },
}

const contribution = {
  package: 'browser-peer-test',
  descriptors: [{
    id: 'browser-peer-test#echo',
    service: 'echoService',
    namespace: 'echo',
    method: 'echo',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'value', wire: 'value', source: 'json', codec: stringCodec }],
    result: stringCodec,
  }],
}

class MockSocket extends EventTarget {
  readyState = 0
  bufferedAmount = 0

  constructor(readonlyUrl, readonlyProtocol) {
    super()
    this.url = readonlyUrl
    this.protocol = readonlyProtocol
    queueMicrotask(() => {
      this.readyState = 1
      this.dispatchEvent(new Event('open'))
    })
  }

  close() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchEvent(new Event('close'))
  }

  send(data) {
    const request = JSON.parse(data)
    if (request.method !== 'connection.rpc') return
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
      type: 'server-response',
      rpcId: request.rpcId,
      result: { ok: true, value: `browser:${request.payload.payload.args.value}` },
    }) })))
  }
}

test('standalone browser peer owns one generation and both native event sockets', async () => {
  const sockets = []
  const requests = []
  const client = new BrowserPeerClient({
    baseUrl: 'http://127.0.0.1:3081/',
    contribution,
    createWebSocket(url, protocol) {
      const socket = new MockSocket(url, protocol)
      sockets.push(socket)
      return socket
    },
    async fetch(input, init) {
      const url = new URL(input)
      requests.push({ path: url.pathname, init })
      if (url.pathname === '/api/connection.open') return Response.json({ id: 'peer-browser-1' })
      return new Response('not found', { status: 404 })
    },
  })

  const states = []
  const stopState = client.onState(connected => states.push(connected))
  await client.connect()

  assert.equal(client.connected, true)
  assert.deepEqual(sockets.map(socket => new URL(socket.url).pathname).sort(), [
    '/api/events.host',
    '/api/events.mux',
  ])
  assert.ok(sockets.every(socket => socket.protocol === 'peer-browser-1'))
  assert.deepEqual(await client.remote.echo.echo('hello'), { ok: true, value: 'browser:hello' })
  assert.deepEqual(requests.map(request => request.path), ['/api/connection.open'])

  const events = []
  const stopEvent = client.onEvent(event => events.push(event))
  const host = sockets.find(socket => new URL(socket.url).pathname === '/api/events.host')
  host.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
    type: 'server-request',
    rpcId: 'push-1',
    method: 'events.host',
    payload: {
      type: 'host/session-status',
      sessionId: '11111111-1111-4111-8111-111111111111',
      running: true,
    },
  }) }))
  assert.equal(events.length, 1)
  assert.equal(events[0].channel, 'host')
  assert.equal(events[0].envelope.payload.type, 'host/session-status')
  stopEvent()

  sockets[0].close()
  assert.equal(client.connected, false)
  assert.deepEqual(states, [false, true, false])
  stopState()
  await client.close()
})
