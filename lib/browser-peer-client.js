import { Context } from '@deepseek-ai/cordis';
import { serverRequestSchema, } from '@deepseek-ai/dsh-host-apiproxy/api';
import { hostFrameSchema, muxFrameSchema } from '@deepseek-ai/dsh-host-apiproxy/api/events.schema';
import TypertRegistry from '@deepseek-ai/dsh-typert-registry';
import { createClientConnectionBinding } from './shared/client-connection.js';
import { PeerRemoteProjector } from './shared/peer-remote.js';
import {} from './shared/protocol.js';
const MUX_PATH = '/api/events.mux';
const HOST_PATH = '/api/events.host';
const INTERNAL_BASE = 'http://dsh.internal';
/** Standalone browser owner for one native DSH Connection and both event streams. */
export class BrowserPeerClient {
    ctx = new Context();
    fetch;
    baseUrl;
    contribution;
    createWebSocket;
    connection;
    projector;
    caller;
    eventListeners = new Set();
    stateListeners = new Set();
    generation;
    mounting;
    disposeRemote;
    connecting;
    opening;
    remote;
    constructor(options) {
        new TypertRegistry(this.ctx);
        this.fetch = options.fetch ?? globalThis.fetch;
        const origin = globalThis.location?.origin;
        this.baseUrl = new URL(options.baseUrl ?? (origin !== undefined && origin !== 'null' ? origin : INTERNAL_BASE));
        this.contribution = options.contribution;
        this.createWebSocket = options.createWebSocket ?? ((url, protocol) => new WebSocket(url, protocol));
        this.connection = createClientConnectionBinding({
            fetch: this.fetch,
            baseUrl: () => this.baseUrl.href,
        });
        this.projector = new PeerRemoteProjector(this.ctx);
        this.caller = { call: (channel, endpoint, payload, signal) => this.call(channel, endpoint, payload, signal) };
        this.remote = this.projector.bind(this.caller, this.ctx);
    }
    get connected() {
        return this.generation?.active === true;
    }
    connect(signal) {
        if (this.connected)
            return Promise.resolve();
        if (this.connecting !== undefined)
            return this.connecting;
        const opening = new AbortController();
        this.opening = opening;
        const combined = signal === undefined ? opening.signal : AbortSignal.any([opening.signal, signal]);
        this.connecting = this.open(combined).finally(() => {
            if (this.opening === opening)
                this.opening = undefined;
            this.connecting = undefined;
        });
        return this.connecting;
    }
    onEvent(listener) {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }
    onState(listener) {
        this.stateListeners.add(listener);
        listener(this.connected);
        return () => this.stateListeners.delete(listener);
    }
    async close() {
        this.opening?.abort(new Error('Browser peer client closed'));
        await this.connecting?.catch(() => undefined);
        this.dropGeneration(new Error('Browser peer client closed'));
        const disposeRemote = this.disposeRemote;
        this.disposeRemote = undefined;
        this.mounting = undefined;
        await disposeRemote?.();
    }
    async open(signal) {
        this.dropGeneration(new Error('Browser peer connection replaced'));
        this.mounting ??= this.projector.mount(this.ctx, this.contribution);
        this.disposeRemote = await this.mounting;
        const connection = await this.connection.open(signal);
        const generation = {
            connection,
            mux: this.createWebSocket(webSocketUrl(this.baseUrl, MUX_PATH), connection.id),
            host: this.createWebSocket(webSocketUrl(this.baseUrl, HOST_PATH), connection.id),
            abort: new AbortController(),
            active: false,
        };
        this.generation = generation;
        this.connection.attach(connection, 'host', generation.host);
        this.attach(generation, 'mux', generation.mux);
        this.attach(generation, 'host', generation.host);
        try {
            await Promise.all([
                waitForOpen(generation.mux, signal),
                waitForOpen(generation.host, signal),
            ]);
            if (this.generation !== generation || generation.abort.signal.aborted)
                throw generation.abort.signal.reason;
            generation.active = true;
            this.emitState(true);
        }
        catch (error) {
            this.dropGeneration(new Error('Browser peer connection failed'));
            throw error;
        }
    }
    attach(generation, channel, socket) {
        socket.addEventListener('message', event => {
            if (this.generation !== generation || generation.abort.signal.aborted)
                return;
            try {
                if (typeof event.data !== 'string')
                    throw new Error('binary WebSocket frame');
                const raw = JSON.parse(event.data);
                if (channel === 'host' && this.connection.handle(raw, generation.connection))
                    return;
                const full = serverRequestSchema.parse(raw);
                const peerEvent = channel === 'mux'
                    ? { channel, envelope: { rpcId: full.rpcId, payload: muxFrameSchema.parse(full.payload) } }
                    : { channel, envelope: { rpcId: full.rpcId, payload: hostFrameSchema.parse(full.payload) } };
                for (const listener of this.eventListeners)
                    listener(peerEvent);
            }
            catch (error) {
                console.error(`[the-binding-of-dsh] dropping malformed ${channel} frame:`, error);
            }
        });
        const failed = () => this.fail(generation, new Error(`Browser peer ${channel} stream closed`));
        socket.addEventListener('close', failed, { once: true });
        socket.addEventListener('error', failed, { once: true });
    }
    fail(generation, reason) {
        if (this.generation !== generation || generation.abort.signal.aborted)
            return;
        this.dropGeneration(reason);
    }
    dropGeneration(reason) {
        const generation = this.generation;
        this.generation = undefined;
        if (generation === undefined)
            return;
        const wasActive = generation.active;
        generation.active = false;
        generation.abort.abort(reason);
        this.connection.release(generation.connection);
        generation.mux.close();
        generation.host.close();
        if (wasActive)
            this.emitState(false);
    }
    emitState(connected) {
        for (const listener of this.stateListeners)
            listener(connected);
    }
    async call(channel, endpoint, payload, signal) {
        const generation = this.generation;
        if (generation?.active !== true)
            throw new Error('Browser peer client is not connected');
        const requestSignal = signal === undefined
            ? generation.abort.signal
            : AbortSignal.any([generation.abort.signal, signal]);
        return this.connection.call(channel, endpoint, payload, requestSignal);
    }
}
function webSocketUrl(baseUrl, path) {
    const url = new URL(path, baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.href;
}
function waitForOpen(socket, signal) {
    if (socket.readyState === 1)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        const opened = () => finish(resolve);
        const failed = () => finish(() => reject(new Error('WebSocket failed before opening')));
        const aborted = () => finish(() => reject(signal.reason));
        const finish = (settle) => {
            socket.removeEventListener('open', opened);
            socket.removeEventListener('close', failed);
            socket.removeEventListener('error', failed);
            signal.removeEventListener('abort', aborted);
            settle();
        };
        socket.addEventListener('open', opened, { once: true });
        socket.addEventListener('close', failed, { once: true });
        socket.addEventListener('error', failed, { once: true });
        signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted)
            aborted();
    });
}
//# sourceMappingURL=browser-peer-client.js.map