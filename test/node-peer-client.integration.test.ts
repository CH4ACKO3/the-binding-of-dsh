import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import {
  HostConnectionBinding,
  NodePeerClient,
} from '../lib/index.js'

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

const descriptors = ['echo', 'wait'].map(method => ({
  id: `node-test#${method}`,
  service: 'echoService',
  namespace: 'echo',
  method,
  invocation: { kind: 'direct' },
  parameters: [{ name: 'value', wire: 'value', source: 'json', codec: stringCodec }],
  result: stringCodec,
}))

test('Node peer completes calls in both directions over the existing Connection carrier', async t => {
  const host = new HostConnectionBinding()
  const sockets = new WebSocketServer({ noServer: true })
  let origin
  let releaseWait
  const wait = new Promise(resolve => {
    releaseWait = resolve
  })
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    const webRequest = new Request(new URL(request.url, origin), {
      method: request.method,
      headers: request.headers,
      ...(body.length === 0 ? {} : { body }),
    })
    let result = await host.fetch(webRequest)
    const path = new URL(request.url, origin).pathname
    if (result === undefined && (path === '/api/echo/echo' || path === '/api/echo/wait')) {
      const message = JSON.parse(body.toString())
      if (path.endsWith('/wait')) await wait
      result = Response.json({
        type: 'server-response',
        rpcId: message.rpcId,
        result: { ok: true, value: `node:${message.payload.args.value}` },
      })
    }
    result ??= new Response('not found', { status: 404 })
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()))
    response.end(Buffer.from(await result.arrayBuffer()))
  })
  server.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url, origin).pathname
    const kind = path === '/api/events.mux' ? 'mux' : path === '/api/events.host' ? 'host' : undefined
    if (kind === undefined) return socket.destroy()
    sockets.handleUpgrade(request, socket, head, websocket => {
      websocket.kind = kind
      host.attach(kind, request, websocket)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  origin = `http://127.0.0.1:${address.port}`
  const client = new NodePeerClient({
    baseUrl: origin,
    contribution: { package: 'node-peer-test', descriptors },
  })
  const disposeInbound = client.intercept(
    '/api',
    endpoint => endpoint === 'echo/reverse',
    async (_endpoint, payload) => ({ ok: true, value: `host:${payload.value}` }),
  )
  t.after(async () => {
    disposeInbound()
    releaseWait()
    await client.close()
    host.dispose()
    for (const socket of sockets.clients) socket.terminate()
    await new Promise(resolve => sockets.close(resolve))
    await new Promise(resolve => server.close(resolve))
  })

  await client.connect()
  const peer = host.peers.list()[0]
  assert.ok(peer)
  assert.equal(peer.kind, 'node')
  assert.deepEqual(await peer.call('/api', 'echo/reverse', { value: 'hello' }), {
    ok: true,
    value: 'host:hello',
  })
  assert.deepEqual(await client.remote.echo.echo('hello'), {
    ok: true,
    value: 'node:hello',
  })

  const pending = client.remote.echo.wait('loss')
  const mux = [...sockets.clients].find(socket => socket.kind === 'mux')
  assert.ok(mux)
  mux.terminate()
  const disconnected = await pending
  assert.equal(disconnected.ok, false)
  assert.match(disconnected.error.message, /Node peer connection closed/)

  await client.close()
  assert.equal(client.remote.echo, undefined)
})
