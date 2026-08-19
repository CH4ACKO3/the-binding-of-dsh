import { randomUUID } from 'node:crypto';
import { CONNECTION_CANCEL_METHOD, CONNECTION_OPEN_PATH, CONNECTION_PEER_HEADER, CONNECTION_RESPOND_PATH, CONNECTION_RPC_HEADER, CONNECTION_RPC_METHOD, } from '../shared/protocol.js';
const sendQueues = new WeakMap();
function clientResponse(value) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const message = value;
    if (message.type !== 'client-response' || typeof message.rpcId !== 'string'
        || typeof message.result !== 'object' || message.result === null
        || typeof message.result.ok !== 'boolean')
        return undefined;
    if (message.result.ok) {
        return Object.hasOwn(message.result, 'value') ? message : undefined;
    }
    const error = message.result.error;
    return typeof error === 'object' && error !== null
        && typeof error.code === 'string' && typeof error.message === 'string'
        && Object.hasOwn(error, 'details')
        ? message
        : undefined;
}
export function sendConnectionMessage(socket, message) {
    const previous = sendQueues.get(socket) ?? Promise.resolve();
    const next = previous.then(() => new Promise((resolve, reject) => {
        if (socket.readyState !== 1)
            return reject(new Error('WebSocket downlink is closed'));
        socket.send(JSON.stringify(message), error => error == null ? resolve() : reject(error));
    }));
    sendQueues.set(socket, next);
    return next;
}
export class HostConnectionBinding {
    generations = new Map();
    published = new Map();
    listeners = new Set();
    peers = {
        get: id => this.published.get(id),
        list: () => [...this.published.values()],
        subscribe: listener => {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        },
    };
    fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === CONNECTION_OPEN_PATH)
            return this.open(request);
        if (path !== CONNECTION_RESPOND_PATH)
            return undefined;
        const id = request.headers.get(CONNECTION_PEER_HEADER);
        const generation = id === null ? undefined : this.generations.get(id);
        if (generation === undefined || generation.failed)
            return undefined;
        const rpcId = request.headers.get(CONNECTION_RPC_HEADER);
        if (rpcId === null || !generation.pending.has(rpcId))
            return undefined;
        return this.respond(generation, request);
    }
    attach(kind, request, socket) {
        const header = request.headers['sec-websocket-protocol'];
        const id = typeof header === 'string' ? header.split(',', 1)[0]?.trim() : undefined;
        const generation = id === undefined ? undefined : this.generations.get(id);
        if (generation === undefined || generation.failed || generation[kind] !== undefined) {
            socket.close(1008, 'invalid connection peer');
            return false;
        }
        generation[kind] = socket;
        const failed = () => this.fail(generation, new Error('Connection generation closed'));
        socket.once('close', failed);
        socket.once('error', failed);
        if (generation.mux !== undefined && generation.host !== undefined)
            this.publish(generation);
        return true;
    }
    dispose() {
        for (const generation of [...this.generations.values()]) {
            this.fail(generation, new Error('Connection service disposed'));
        }
        this.listeners.clear();
    }
    async open(request) {
        if (request.method !== 'POST')
            return new Response('method not allowed', { status: 405 });
        const id = randomUUID();
        this.generations.set(id, {
            id,
            kind: request.headers.get('content-type')?.startsWith('application/json') === true
                && (await request.json()).kind === 'node'
                ? 'node'
                : 'browser',
            failed: false,
            pending: new Map(),
        });
        return Response.json({ id });
    }
    async respond(generation, request) {
        if (request.method !== 'POST')
            return new Response('method not allowed', { status: 405 });
        let body;
        try {
            body = await request.json();
        }
        catch {
            return Response.json({ accepted: false, reason: 'bad-response' });
        }
        const message = clientResponse(body);
        if (message === undefined)
            return Response.json({ accepted: false, reason: 'bad-response' });
        if (message.rpcId !== request.headers.get(CONNECTION_RPC_HEADER)) {
            return Response.json({ accepted: false, reason: 'bad-response' });
        }
        const pending = generation.pending.get(message.rpcId);
        if (pending === undefined)
            return Response.json({ accepted: false, reason: 'not-pending' });
        generation.pending.delete(message.rpcId);
        pending.dispose();
        pending.resolve(message.result);
        return Response.json({ accepted: true });
    }
    publish(generation) {
        if (generation.peer !== undefined || generation.failed)
            return;
        const peer = {
            id: generation.id,
            kind: generation.kind,
            call: (channel, endpoint, payload, signal) => this.call(generation, channel, endpoint, payload, signal),
        };
        generation.peer = peer;
        this.published.set(peer.id, peer);
        this.emit({ type: 'added', peer });
    }
    call(generation, channel, endpoint, payload, signal) {
        if (generation.failed || generation.host === undefined || generation.peer === undefined) {
            return Promise.reject(new Error('Connection peer is not active'));
        }
        if (signal?.aborted === true)
            return Promise.reject(signal.reason);
        const rpcId = randomUUID();
        return new Promise((resolve, reject) => {
            const aborted = () => {
                const pending = generation.pending.get(rpcId);
                if (pending === undefined)
                    return;
                generation.pending.delete(rpcId);
                pending.dispose();
                reject(signal?.reason);
                void sendConnectionMessage(generation.host, {
                    type: 'server-request',
                    rpcId,
                    method: CONNECTION_CANCEL_METHOD,
                    payload: null,
                }).catch(() => undefined);
            };
            const pending = {
                resolve,
                reject,
                dispose: () => signal?.removeEventListener('abort', aborted),
            };
            generation.pending.set(rpcId, pending);
            signal?.addEventListener('abort', aborted, { once: true });
            void sendConnectionMessage(generation.host, {
                type: 'server-request',
                rpcId,
                method: CONNECTION_RPC_METHOD,
                payload: { channel, endpoint, payload },
            }).catch(error => this.fail(generation, error));
        });
    }
    fail(generation, error) {
        if (generation.failed)
            return;
        generation.failed = true;
        this.generations.delete(generation.id);
        if (generation.peer !== undefined) {
            this.published.delete(generation.id);
            this.emit({ type: 'removed', peer: generation.peer });
        }
        for (const pending of generation.pending.values()) {
            pending.dispose();
            pending.reject(error);
        }
        generation.pending.clear();
        for (const socket of [generation.mux, generation.host]) {
            if (socket !== undefined && (socket.readyState === 0 || socket.readyState === 1))
                socket.close();
        }
    }
    emit(change) {
        for (const listener of [...this.listeners])
            listener(change);
    }
}
//# sourceMappingURL=connection.js.map