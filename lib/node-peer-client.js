import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import { serverResponseSchema } from '@deepseek-ai/dsh-host-apiproxy/api/rpc.schema';
import TypertRegistry from '@deepseek-ai/dsh-typert-registry';
import WebSocket from 'ws';
import { PeerRemoteProjector, } from './shared/peer-remote.js';
import { CONNECTION_OPEN_PATH } from './shared/protocol.js';
const MUX_PATH = '/api/events.mux';
const HOST_PATH = '/api/events.host';
export class NodePeerClient {
    ctx = new Context();
    fetch;
    baseUrl;
    contribution;
    createWebSocket;
    projector;
    caller;
    generation;
    mounting;
    disposeRemote;
    connecting;
    opening;
    remote;
    constructor(options) {
        new TypertRegistry(this.ctx);
        this.fetch = options.fetch ?? globalThis.fetch;
        this.baseUrl = new URL(options.baseUrl);
        this.contribution = options.contribution;
        this.createWebSocket = options.createWebSocket
            ?? ((url, protocol) => new WebSocket(url, protocol));
        this.projector = new PeerRemoteProjector(this.ctx);
        this.caller = { call: (channel, endpoint, payload, signal) => (this.call(channel, endpoint, payload, signal)) };
        this.remote = this.projector.bind(this.caller, this.ctx);
    }
    connect(signal) {
        if (this.generation?.active === true)
            return Promise.resolve();
        if (this.connecting !== undefined)
            return this.connecting;
        const opening = new AbortController();
        this.opening = opening;
        const combined = signal === undefined
            ? opening.signal
            : AbortSignal.any([opening.signal, signal]);
        this.connecting = this.open(combined).finally(() => {
            if (this.opening === opening)
                this.opening = undefined;
            this.connecting = undefined;
        });
        return this.connecting;
    }
    async close() {
        this.opening?.abort(new Error('Node peer client closed'));
        await this.connecting?.catch(() => undefined);
        this.dropGeneration(new Error('Node peer client closed'));
        await this.withdrawRemote();
    }
    dropGeneration(reason) {
        const generation = this.generation;
        this.generation = undefined;
        if (generation !== undefined) {
            generation.active = false;
            generation.abort.abort(reason);
            generation.mux.close();
            generation.host.close();
        }
    }
    async withdrawRemote() {
        const disposeRemote = this.disposeRemote;
        this.disposeRemote = undefined;
        this.mounting = undefined;
        await disposeRemote?.();
    }
    async open(signal) {
        if (this.generation !== undefined) {
            this.dropGeneration(new Error('Node peer connection replaced'));
        }
        this.mounting ??= this.projector.mount(this.ctx, this.contribution);
        this.disposeRemote = await this.mounting;
        try {
            const response = await this.fetch(new URL(CONNECTION_OPEN_PATH, this.baseUrl), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ kind: 'node' }),
                signal,
            });
            if (!response.ok)
                throw new Error(`Connection open failed with HTTP ${response.status}`);
            const body = await response.json();
            if (typeof body.id !== 'string' || body.id === '') {
                throw new Error('Connection open returned no peer id');
            }
            const abort = new AbortController();
            const generation = {
                id: body.id,
                mux: this.createWebSocket(webSocketUrl(this.baseUrl, MUX_PATH), body.id),
                host: this.createWebSocket(webSocketUrl(this.baseUrl, HOST_PATH), body.id),
                abort,
                active: false,
            };
            this.generation = generation;
            const failed = () => this.fail(generation, new Error('Node peer connection closed'));
            generation.mux.addEventListener('close', failed);
            generation.host.addEventListener('close', failed);
            generation.mux.addEventListener('error', failed);
            generation.host.addEventListener('error', failed);
            await Promise.all([
                waitForOpen(generation.mux, signal),
                waitForOpen(generation.host, signal),
            ]);
            if (this.generation !== generation || abort.signal.aborted)
                throw abort.signal.reason;
            generation.active = true;
        }
        catch (error) {
            this.dropGeneration(new Error('Node peer connection failed'));
            await this.withdrawRemote();
            throw error;
        }
    }
    async call(channel, endpoint, payload, signal) {
        const generation = this.generation;
        if (generation?.active !== true)
            throw new Error('Node peer client is not connected');
        const requestSignal = signal === undefined
            ? generation.abort.signal
            : AbortSignal.any([generation.abort.signal, signal]);
        const rpcId = randomUUID();
        const response = await this.fetch(new URL(`${channel}/${endpoint}`, this.baseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                type: 'client-request',
                rpcId,
                method: endpoint,
                payload,
            }),
            signal: requestSignal,
        });
        if (!response.ok) {
            throw new Error(`transport failure for ${channel}/${endpoint}: HTTP ${response.status}`);
        }
        const full = serverResponseSchema.parse(await response.json());
        if (full.rpcId !== rpcId) {
            throw new Error(`rpcId mismatch for ${endpoint}: sent ${rpcId}, got ${full.rpcId}`);
        }
        return full.result;
    }
    fail(generation, error) {
        if (this.generation !== generation || generation.abort.signal.aborted)
            return;
        generation.active = false;
        generation.abort.abort(error);
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
//# sourceMappingURL=node-peer-client.js.map