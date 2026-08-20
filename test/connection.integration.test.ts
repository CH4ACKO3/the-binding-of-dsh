import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import WebSocket, { WebSocketServer } from 'ws'
import { HostConnectionBinding } from '../lib/host/connection.js'
import { createClientConnectionBinding } from '../lib/shared/client-connection.js'

test('Host and Client complete a reverse call over real HTTP and WebSocket carriers', async t => {
  const host = new HostConnectionBinding()
  let origin
  let client
  let generation
  let mux
  let downlink
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    const result = await host.fetch(new Request(new URL(request.url, origin), {
      method: request.method,
      headers: request.headers,
      ...(body.length === 0 ? {} : { body }),
    })) ?? new Response('not found', { status: 404 })
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()))
    response.end(Buffer.from(await result.arrayBuffer()))
  })
  const sockets = new WebSocketServer({ noServer: true })
  t.after(async () => {
    if (client !== undefined && generation !== undefined) client.release(generation)
    mux?.terminate()
    downlink?.terminate()
    host.dispose()
    for (const socket of sockets.clients) socket.terminate()
    await new Promise(resolve => sockets.close(resolve))
    await new Promise(resolve => server.close(resolve))
  })
  server.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url, origin).pathname
    const kind = path === '/api/events.mux' ? 'mux' : path === '/api/events.host' ? 'host' : undefined
    if (kind === undefined) return socket.destroy()
    sockets.handleUpgrade(request, socket, head, websocket => {
      host.attach(kind, request, websocket)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  origin = `http://127.0.0.1:${address.port}`

  client = createClientConnectionBinding({ baseUrl: () => origin })
  client.intercept('/api', endpoint => endpoint === 'echo/run', async (_endpoint, payload) => ({
    ok: true,
    value: payload.value + 1,
  }))
  generation = await client.open()
  mux = new WebSocket(`${origin.replace('http:', 'ws:')}/api/events.mux`, generation.id)
  downlink = new WebSocket(`${origin.replace('http:', 'ws:')}/api/events.host`, generation.id)
  downlink.on('message', data => client.handle(JSON.parse(data.toString()), generation))
  await Promise.all([once(mux, 'open'), once(downlink, 'open')])
  const peer = host.peers.list()[0] ?? await new Promise(resolve => {
    const dispose = host.peers.subscribe(change => {
      if (change.type !== 'added') return
      dispose()
      resolve(change.peer)
    })
  })

  assert.deepEqual(await peer.call('/api', 'echo/run', { value: 1 }), {
    ok: true,
    value: 2,
  })
})
