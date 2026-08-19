import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import {
  HostRemoteService,
  createGatewayDispatcher,
  installClientGateway,
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

const descriptor = {
  id: 'test#echo',
  service: 'echoService',
  namespace: 'echo',
  method: 'echo',
  invocation: { kind: 'direct' },
  parameters: [{
    name: 'value',
    wire: 'value',
    source: 'json',
    codec: stringCodec,
  }],
  result: stringCodec,
}

const cancellableDescriptor = {
  ...descriptor,
  id: 'test#wait',
  method: 'wait',
  cancellation: { parameter: 'signal' },
}

const badResultDescriptor = {
  ...descriptor,
  id: 'test#badResult',
  method: 'badResult',
  parameters: [],
}

const lookupDescriptor = {
  ...descriptor,
  id: 'test#lookup',
  method: 'lookup',
  parameters: [{
    name: 'entity',
    wire: 'entityId',
    source: 'lookup',
    lookup: 'entity',
    codec: stringCodec,
  }],
}

const scopedDescriptor = {
  ...descriptor,
  id: 'test#scoped',
  method: 'scoped',
  invocation: {
    kind: 'context',
    context: 'scope',
    wire: 'scopeId',
    codec: stringCodec,
  },
}

class EchoService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'echoService', { namespace: 'echo' })
  }

  echo(value) {
    return `echo:${value}`
  }

  wait(value, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(`late:${value}`), 1000)
      const aborted = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      if (signal.aborted) return aborted()
      signal.addEventListener('abort', aborted, { once: true })
    })
  }

  badResult() {
    return 42
  }

  lookup(entity) {
    return entity.label
  }

  scoped(value) {
    return `scoped:${value}`
  }
}

class ClientConnectionStub extends Service {
  constructor(ctx, state) {
    super(ctx, 'connection')
    this.rpc = {
      intercept: (channel, matches, handler) => {
        state.registration = { channel, matches, handler }
        return () => {
          state.disposed = true
        }
      },
    }
  }
}

async function environment() {
  const ctx = new Context()
  const fiber = ctx.plugin({
    name: 'gateway-test-environment',
    apply(pluginCtx) {
      new TypertRegistry(pluginCtx)
      new EchoService(pluginCtx)
    },
  })
  await fiber
  const disposeLookup = fiber.ctx.typert.lookups.register('entity', {
    parameter: 'entity',
    wire: 'entityId',
    hostTypeSymbol: 'Entity',
    wireTypeSymbol: 'string',
    resolve: id => ({ label: `entity:${id}` }),
  })
  const disposeHostContext = fiber.ctx.typert.contexts.registerHost('scope', {
    wire: 'scopeId',
    wireTypeSymbol: 'string',
    resolve: id => id === 'scope-1' ? fiber.ctx : undefined,
  })
  const disposeClientContext = fiber.ctx.typert.contexts.registerClient('scope', {
    identity: () => 'scope-1',
  })
  const contribution = {
    package: 'gateway-test',
    face: 'host',
    schemas: [],
    model: {},
    invocations: [
      descriptor,
      cancellableDescriptor,
      badResultDescriptor,
      lookupDescriptor,
      scopedDescriptor,
    ],
  }
  const disposeContribution = fiber.ctx.typert.register(contribution)
  return {
    ctx: fiber.ctx,
    dispose: async () => {
      await disposeContribution()
      await disposeClientContext()
      await disposeHostContext()
      await disposeLookup()
      await fiber.dispose()
    },
  }
}

test('shared Gateway dispatcher enforces strict request and result boundaries', async () => {
  const server = await environment()
  try {
    const dispatcher = createGatewayDispatcher(server.ctx)
    assert.equal(dispatcher.claimsEndpoint('echo/echo'), true)
    assert.deepEqual(
      await dispatcher.invokeRpc(
        'echo/echo',
        { args: { value: 'hello' } },
        new AbortController().signal,
      ),
      { ok: true, value: 'echo:hello' },
    )

    const missing = await dispatcher.invokeRpc(
      'echo/echo',
      { args: {} },
      new AbortController().signal,
    )
    assert.equal(missing.ok, false)
    assert.match(missing.error.message, /missing "value"/)

    const invalid = await dispatcher.invokeRpc(
      'echo/echo',
      { args: { value: 1 } },
      new AbortController().signal,
    )
    assert.equal(invalid.ok, false)
    assert.match(invalid.error.message, /boundary validation/)

    const badResult = await dispatcher.invokeRpc(
      'echo/badResult',
      { args: {} },
      new AbortController().signal,
    )
    assert.equal(badResult.ok, false)
    assert.match(badResult.error.message, /business result failed boundary validation/)

    assert.deepEqual(
      await dispatcher.invokeRpc(
        'echo/lookup',
        { args: { entityId: '42' } },
        new AbortController().signal,
      ),
      { ok: true, value: 'entity:42' },
    )
    assert.deepEqual(
      await dispatcher.invokeRpc(
        'echo/scoped',
        { args: { scopeId: 'scope-1', value: 'hello' } },
        new AbortController().signal,
      ),
      { ok: true, value: 'scoped:hello' },
    )
  } finally {
    await server.dispose()
  }
})

test('Client Gateway owns local Typert endpoints through Connection interception', async () => {
  const state = { registration: undefined, disposed: false }
  const root = new Context()
  const connectionFiber = root.plugin({
    name: 'client-connection-stub',
    apply(ctx) {
      new ClientConnectionStub(ctx, state)
    },
  })
  await connectionFiber
  const fiber = root.plugin({
    name: 'client-gateway-test',
    apply(ctx) {
      new TypertRegistry(ctx)
      new EchoService(ctx)
      installClientGateway(ctx)
    },
  })
  await fiber
  fiber.ctx.typert.register({
    package: 'client-gateway-test',
    face: 'client',
    schemas: [],
    model: {},
    invocations: [descriptor],
  })

  assert.equal(state.registration.channel, '/api')
  assert.equal(state.registration.matches('echo/echo'), true)
  assert.deepEqual(
    await state.registration.handler(
      'echo/echo',
      { args: { value: 'from-host' } },
      new AbortController().signal,
    ),
    { ok: true, value: 'echo:from-host' },
  )

  await fiber.dispose()
  assert.equal(state.disposed, true)
  await connectionFiber.dispose()
})

test('Host Remote binds calls to one peer and shares the serving dispatcher', async () => {
  const caller = await environment()
  const server = await environment()
  try {
    const dispatcher = createGatewayDispatcher(server.ctx)
    const calls = []
    const peer = {
      id: 'selected-peer',
      kind: 'browser',
      async call(channel, endpoint, payload, signal) {
        calls.push({ channel, endpoint })
        return dispatcher.invokeRpc(endpoint, payload, signal ?? new AbortController().signal)
      },
    }

    const remoteFiber = caller.ctx.plugin({
      name: 'host-remote-test',
      apply(ctx) {
        new HostRemoteService(ctx)
      },
    })
    await remoteFiber
    const disposeRemote = await remoteFiber.ctx.remote.$mount({
      package: 'gateway-test-remote',
      descriptors: [
        descriptor,
        cancellableDescriptor,
        badResultDescriptor,
        lookupDescriptor,
        scopedDescriptor,
      ],
    })
    const remote = remoteFiber.ctx.remote.for(peer)

    assert.deepEqual(await remote.echo.echo('hello'), { ok: true, value: 'echo:hello' })
    assert.deepEqual(calls, [{ channel: '/api', endpoint: 'echo/echo' }])

    const controller = new AbortController()
    const waiting = remote.echo.wait('hello', controller.signal)
    controller.abort(new Error('stop'))
    const cancelled = await waiting
    assert.equal(cancelled.ok, false)
    assert.match(cancelled.error.message, /stop|aborted|failed/)

    const badResult = await remote.echo.badResult()
    assert.equal(badResult.ok, false)
    assert.match(badResult.error.message, /business result failed boundary validation/)
    assert.deepEqual(await remote.echo.lookup('42'), { ok: true, value: 'entity:42' })
    assert.deepEqual(await remote.echo.scoped('hello'), { ok: true, value: 'scoped:hello' })

    await disposeRemote()
    assert.equal(remote.echo, undefined)
    await remoteFiber.dispose()
  } finally {
    await server.dispose()
    await caller.dispose()
  }
})
