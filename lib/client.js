window.__ModuleLoader__.load({
  id: "the-binding-of-dsh",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region src/shared/gateway-dispatcher.ts
const NEVER_ABORTED_SIGNAL = new AbortController().signal;
const CORDIS_ORIGINAL = Symbol.for("cordis.original");
var GatewayDispatchError = class extends Error {
	code;
	endpoint;
	field;
	constructor(code, endpoint, message, options = {}) {
		super(`typert gateway: ${endpoint}: ${message}`, options.cause === void 0 ? void 0 : { cause: options.cause });
		this.code = code;
		this.endpoint = endpoint;
		this.name = "TypertGatewayError";
		this.field = options.field;
	}
};
var RemoteInvocationCancelled = class extends Error {
	constructor(endpoint, cause) {
		super(`Remote invocation "${endpoint}" was aborted`, { cause });
		this.name = "RemoteInvocationCancelled";
	}
};
function createGatewayDispatcher(ctx, runtime = {}) {
	const lookupFailure = (cause) => {
		const configured = runtime.lookupFailure?.(cause);
		if (configured !== void 0) return configured;
		if (!isObject(cause) || Reflect.get(cause, "name") !== "TypertLookupFailure") return void 0;
		const failure = Reflect.get(cause, "failure");
		if (!isObject(failure)) return void 0;
		if (typeof Reflect.get(failure, "code") !== "string" || typeof Reflect.get(failure, "message") !== "string" || !Object.hasOwn(failure, "details")) return void 0;
		return failure;
	};
	const error = (code, endpoint, message, options) => runtime.createError?.(code, endpoint, message, options) ?? new GatewayDispatchError(code, endpoint, message, options);
	let srcClaims;
	ctx.on("internal/service", () => {
		srcClaims = void 0;
	});
	const collectSrcClaims = () => {
		const claims = /* @__PURE__ */ new Set();
		if (runtime.remoteMethods === void 0) return claims;
		for (const [serviceKey, definition] of Object.entries(ctx.reflect.props)) {
			if (definition.type !== "service") continue;
			const receiver = ctx.get(serviceKey);
			if (!isObject(receiver)) continue;
			const original = originalOf(receiver);
			const binding = Reflect.get(original, "typertRemote");
			if (!isObject(binding) || typeof Reflect.get(binding, "namespace") !== "string") continue;
			const namespace = Reflect.get(binding, "namespace");
			for (const candidate of runtime.remoteMethods(original)) claims.add(endpointOf(namespace, candidate.exportName ?? candidate.method));
		}
		return claims;
	};
	const claimsEndpoint = (endpoint) => {
		const segments = endpoint.split("/");
		if (segments.length !== 2 || segments[0] === "" || segments[1] === "") return false;
		if (ctx.typert.local.get(endpoint) !== void 0 || ctx.typert.local.hasSeen(endpoint)) return true;
		srcClaims ??= collectSrcClaims();
		return srcClaims.has(endpoint);
	};
	const readBinding = (value, original, serviceKey, endpoint, namespace) => {
		if (!isObject(value) || Reflect.get(value, "service") !== original || Reflect.get(value, "serviceKey") !== serviceKey || typeof Reflect.get(value, "namespace") !== "string" || namespace !== void 0 && Reflect.get(value, "namespace") !== namespace) throw error("binding-invalid", endpoint, `Service ${JSON.stringify(serviceKey)} has an inconsistent typertRemote binding`);
		return value;
	};
	const srcDescriptor = (binding, marker, method, endpoint) => {
		const names = methodParameterNames(binding.service, marker.method, endpoint, error);
		const signalIndex = names.indexOf("signal");
		if (signalIndex >= 0 && signalIndex !== names.length - 1) throw error("signature-invalid", endpoint, "SRC cancellation parameter signal must be the final parameter", { field: "signal" });
		const businessNames = signalIndex < 0 ? names : names.slice(0, -1);
		const parameters = [];
		const wires = /* @__PURE__ */ new Set();
		for (const name of businessNames) {
			const matches = ctx.typert.lookups.definitions().filter((definition) => definition.parameter === name);
			if (matches.length > 1) throw error("signature-invalid", endpoint, `parameter ${JSON.stringify(name)} matches multiple lookup providers`, { field: name });
			const match = matches[0];
			const parameter = match === void 0 ? {
				name,
				wire: name,
				source: "json",
				codec: { mode: "src-json" }
			} : {
				name,
				wire: match.wire,
				source: "lookup",
				lookup: match.key,
				codec: { mode: "src-json" }
			};
			if (wires.has(parameter.wire)) throw error("signature-invalid", endpoint, `multiple parameters use wire field ${JSON.stringify(parameter.wire)}`, { field: parameter.wire });
			wires.add(parameter.wire);
			parameters.push(parameter);
		}
		let invocation = { kind: "direct" };
		if (marker.invocation.kind === "context") {
			const provider = ctx.typert.contexts.getHost(marker.invocation.context);
			if (provider === void 0) throw error("context-unavailable", endpoint, `Context provider ${JSON.stringify(marker.invocation.context)} is unavailable`);
			if (wires.has(provider.wire)) throw error("signature-invalid", endpoint, `Context identity conflicts with wire field ${JSON.stringify(provider.wire)}`, { field: provider.wire });
			invocation = {
				kind: "context",
				context: marker.invocation.context,
				wire: provider.wire,
				codec: { mode: "src-json" }
			};
		}
		return {
			id: `src:${binding.serviceKey}#${endpoint}`,
			service: binding.serviceKey,
			namespace: binding.namespace,
			method,
			...marker.method === method ? {} : { implementation: marker.method },
			invocation,
			parameters,
			...signalIndex < 0 ? {} : { cancellation: { parameter: "signal" } },
			result: { mode: "src-json" }
		};
	};
	const resolveDescriptor = (namespace, method, endpoint) => {
		const strict = ctx.typert.local.get(endpoint);
		if (strict !== void 0) return strict;
		if (ctx.typert.local.hasSeen(endpoint)) throw error("definition-unavailable", endpoint, "its strict definition was withdrawn and SRC fallback is forbidden");
		if (runtime.remoteMethods === void 0) throw error("invocation-unavailable", endpoint, "no active Remote method exports this endpoint");
		const candidates = [];
		for (const [serviceKey, definition] of Object.entries(ctx.reflect.props)) {
			if (definition.type !== "service") continue;
			const receiver = ctx.get(serviceKey);
			if (!isObject(receiver)) continue;
			const original = originalOf(receiver);
			const value = Reflect.get(original, "typertRemote");
			if (value === void 0) continue;
			const binding = readBinding(value, original, serviceKey, endpoint);
			if (binding.namespace !== namespace) continue;
			const marker = runtime.remoteMethods(original).find((candidate) => (candidate.exportName ?? candidate.method) === method);
			if (marker !== void 0) candidates.push(srcDescriptor(binding, marker, method, endpoint));
		}
		if (candidates.length === 0) throw error("invocation-unavailable", endpoint, "no active Remote method exports this endpoint");
		if (candidates.length > 1) throw error("ambiguous-endpoint", endpoint, `multiple active Services export this endpoint: ${candidates.map((candidate) => candidate.service).sort().join(", ")}`);
		return candidates[0];
	};
	const resolveReceiverContext = async (descriptor, args, endpoint) => {
		if (descriptor.invocation.kind === "direct") return ctx;
		const invocation = descriptor.invocation;
		const provider = ctx.typert.contexts.getHost(invocation.context);
		if (provider === void 0) throw error("context-unavailable", endpoint, `Context provider ${JSON.stringify(invocation.context)} is unavailable`);
		if (provider.wire !== invocation.wire || invocation.codec.mode === "strict" && provider.wireTypeSymbol !== invocation.codec.typeSymbol) throw error("provider-mismatch", endpoint, `Context provider ${JSON.stringify(invocation.context)} does not match its strict definition`, { field: invocation.wire });
		const identity = decode(invocation.codec, args[invocation.wire], "input-invalid", endpoint, invocation.wire, error);
		let receiverContext;
		try {
			receiverContext = await provider.resolve(identity);
		} catch (cause) {
			if (lookupFailure(cause) !== void 0) throw cause;
			throw error("context-failed", endpoint, `Context provider ${JSON.stringify(invocation.context)} failed`, {
				cause,
				field: invocation.wire
			});
		}
		if (receiverContext === void 0) throw error("context-not-found", endpoint, `Context provider ${JSON.stringify(invocation.context)} did not resolve the requested identity`, { field: invocation.wire });
		return receiverContext;
	};
	const resolveParameter = async (parameter, args, endpoint) => {
		if (!Object.hasOwn(args, parameter.wire)) return void 0;
		const value = decode(parameter.codec, args[parameter.wire], "input-invalid", endpoint, parameter.wire, error);
		if (parameter.source === "json") return value;
		const key = parameter.lookup;
		if (key === void 0) throw error("lookup-unavailable", endpoint, `lookup parameter ${JSON.stringify(parameter.name)} has no provider key`, { field: parameter.wire });
		const provider = ctx.typert.lookups.get(key);
		if (provider === void 0) throw error("lookup-unavailable", endpoint, `lookup provider ${JSON.stringify(key)} is unavailable`, { field: parameter.wire });
		if (provider.wire !== parameter.wire || parameter.codec.mode === "strict" && provider.wireTypeSymbol !== parameter.codec.typeSymbol) throw error("provider-mismatch", endpoint, `lookup provider ${JSON.stringify(key)} does not match its strict definition`, { field: parameter.wire });
		let resolved;
		try {
			resolved = await provider.resolve(value);
		} catch (cause) {
			if (lookupFailure(cause) !== void 0) throw cause;
			throw error("lookup-failed", endpoint, `lookup provider ${JSON.stringify(key)} failed`, {
				cause,
				field: parameter.wire
			});
		}
		if (resolved === void 0) throw error("lookup-not-found", endpoint, `lookup provider ${JSON.stringify(key)} did not resolve the requested identity`, { field: parameter.wire });
		return resolved;
	};
	const invoke = async (request) => {
		const endpoint = endpointOf(request.namespace, request.method);
		const descriptor = resolveDescriptor(request.namespace, request.method, endpoint);
		assertExactArguments(request.args, descriptor, endpoint, error);
		const receiver = (await resolveReceiverContext(descriptor, request.args, endpoint)).get(descriptor.service);
		if (!isObject(receiver)) throw error("service-unavailable", endpoint, `active Service ${JSON.stringify(descriptor.service)} is unavailable`);
		const original = originalOf(receiver);
		readBinding(Reflect.get(original, "typertRemote"), original, descriptor.service, endpoint, descriptor.namespace);
		const args = await Promise.all(descriptor.parameters.map((parameter) => resolveParameter(parameter, request.args, endpoint)));
		if (descriptor.cancellation !== void 0) args.push(request.signal ?? NEVER_ABORTED_SIGNAL);
		const implementation = descriptor.implementation ?? descriptor.method;
		const methodValue = Reflect.get(receiver, implementation);
		if (typeof methodValue !== "function") throw error("method-unavailable", endpoint, `active Service ${JSON.stringify(descriptor.service)} has no callable method ${JSON.stringify(implementation)}`);
		let result;
		try {
			result = await Reflect.apply(methodValue, receiver, args);
		} catch (cause) {
			if (request.signal?.aborted === true) throw new RemoteInvocationCancelled(endpoint, cause);
			throw cause;
		}
		if (result === void 0 && descriptor.result.mode !== "strict") return result;
		return decode(descriptor.result, result, "result-invalid", endpoint, "result", error);
	};
	const invokeRpc = async (endpoint, payload, signal) => {
		try {
			const segments = endpoint.split("/");
			if (segments.length !== 2 || segments[0] === "" || segments[1] === "") throw new Error(`invalid Remote endpoint ${JSON.stringify(endpoint)}`);
			if (!isObject(payload) || !isPlainObject(payload) || Reflect.ownKeys(payload).length !== 1 || !Object.hasOwn(payload, "args") || !isObject(payload.args) || !isPlainObject(payload.args)) throw new Error("Remote payload must contain exactly one plain-object args field");
			return {
				ok: true,
				value: await invoke({
					namespace: segments[0],
					method: segments[1],
					args: payload.args,
					signal
				})
			};
		} catch (cause) {
			if (cause instanceof RemoteInvocationCancelled) return {
				ok: false,
				error: {
					code: "cancelled",
					message: cause.message,
					details: {}
				}
			};
			const failure = lookupFailure(cause);
			if (failure !== void 0) return {
				ok: false,
				error: failure
			};
			return {
				ok: false,
				error: {
					code: "internal",
					message: cause instanceof Error ? cause.message : String(cause),
					details: {}
				}
			};
		}
	};
	return {
		claimsEndpoint,
		invoke,
		invokeRpc
	};
}
function endpointOf(namespace, method) {
	return `${namespace}/${method}`;
}
function originalOf(receiver) {
	const original = Reflect.get(receiver, CORDIS_ORIGINAL);
	return isObject(original) ? original : receiver;
}
function methodParameterNames(service, method, endpoint, error) {
	let prototype = Object.getPrototypeOf(service);
	let implementation;
	while (prototype !== null) {
		const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
		if (descriptor !== void 0) {
			if ("value" in descriptor && typeof descriptor.value === "function") implementation = descriptor.value;
			break;
		}
		prototype = Object.getPrototypeOf(prototype);
	}
	if (implementation === void 0) throw error("method-unavailable", endpoint, `Remote marker has no prototype method ${JSON.stringify(method)}`);
	const source = Function.prototype.toString.call(implementation);
	const open = source.indexOf("(");
	const close = source.indexOf(")", open + 1);
	if (open < 0 || close < 0) return invalidSignature(endpoint, method, error);
	const body = source.slice(open + 1, close).trim();
	if (body.length === 0) return [];
	const parts = body.split(",").map((part) => part.trim());
	const names = /* @__PURE__ */ new Set();
	for (const part of parts) {
		if (!/^[$A-Z_a-z][$\w]*$/u.test(part) || names.has(part)) return invalidSignature(endpoint, method, error);
		names.add(part);
	}
	return [...names];
}
function invalidSignature(endpoint, method, error) {
	throw error("signature-invalid", endpoint, `SRC method ${JSON.stringify(method)} must use unique identifier parameters without destructuring, defaults, or rest`);
}
function assertExactArguments(args, descriptor, endpoint, error) {
	if (!isPlainObject(args)) throw error("arguments-invalid", endpoint, "args must be a plain object");
	const expected = new Set(descriptor.parameters.map((parameter) => parameter.wire));
	if (descriptor.invocation.kind === "context") expected.add(descriptor.invocation.wire);
	const extra = Reflect.ownKeys(args).filter((key) => typeof key !== "string" || !expected.has(key));
	const acceptsMissing = new Set(descriptor.parameters.filter((parameter) => parameter.source === "json" && (parameter.acceptsUndefined === true || parameter.codec.mode === "src-json")).map((parameter) => parameter.wire));
	const missing = [...expected].filter((key) => !Object.hasOwn(args, key) && !acceptsMissing.has(key));
	if (extra.length === 0 && missing.length === 0) return;
	const clauses = [];
	if (missing.length > 0) clauses.push(`missing ${missing.map((key) => JSON.stringify(key)).join(", ")}`);
	if (extra.length > 0) clauses.push(`unexpected ${extra.map((key) => JSON.stringify(String(key))).join(", ")}`);
	throw error("arguments-invalid", endpoint, `args fields do not match the descriptor: ${clauses.join("; ")}`);
}
function decode(codec, value, code, endpoint, field, error) {
	try {
		if (codec.mode === "strict") {
			value = codec.schema.parse(value);
			if (value === void 0) return value;
		}
		assertJsonValue(value, /* @__PURE__ */ new Set());
		return value;
	} catch (cause) {
		throw error(code, endpoint, code === "input-invalid" ? `wire field ${JSON.stringify(field)} failed boundary validation` : "business result failed boundary validation", {
			cause,
			field
		});
	}
}
function assertJsonValue(value, ancestors) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (Number.isFinite(value)) return;
		throw new TypeError("non-finite number is not JSON-safe");
	}
	if (!isObject(value)) throw new TypeError(`${typeof value} is not JSON-safe`);
	if (ancestors.has(value)) throw new TypeError("cyclic value is not JSON-safe");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) throw new TypeError("sparse or decorated array is not JSON-safe");
			for (let index = 0; index < value.length; index += 1) {
				if (!Object.hasOwn(value, index)) throw new TypeError("sparse array is not JSON-safe");
				assertJsonValue(value[index], ancestors);
			}
			return;
		}
		if (!isPlainObject(value)) throw new TypeError("non-plain object is not JSON-safe");
		if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError("symbol property is not JSON-safe");
		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (descriptor === void 0 || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError("non-data property is not JSON-safe");
			assertJsonValue(descriptor.value, ancestors);
		}
	} finally {
		ancestors.delete(value);
	}
}
function isPlainObject(value) {
	if (Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.prototype;
}
function isObject(value) {
	return typeof value === "object" && value !== null || typeof value === "function";
}
//#endregion
//#region src/shared/client-gateway.ts
function installClientGateway(ctx) {
	const dispatcher = createGatewayDispatcher(ctx);
	const dispose = ctx.get("connection").rpc.intercept("/api", (endpoint) => dispatcher.claimsEndpoint(endpoint), (endpoint, payload, signal) => dispatcher.invokeRpc(endpoint, payload, signal));
	ctx.effect(() => dispose, "bidirectional-gateway.client.local");
}
//#endregion
//#region src/shared/protocol.ts
const CONNECTION_OPEN_PATH = "/api/connection.open";
const CONNECTION_RESPOND_PATH = "/api/respond";
const CONNECTION_PEER_HEADER = "x-dsh-connection-peer";
const CONNECTION_RPC_HEADER = "x-dsh-connection-rpc";
function isReverseRpcPayload(value) {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value;
	return typeof candidate.channel === "string" && typeof candidate.endpoint === "string" && Object.hasOwn(candidate, "payload");
}
function internalFailure(error) {
	return {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error),
			details: {}
		}
	};
}
//#endregion
//#region src/shared/client-connection.ts
const INTERNAL_BASE = "http://dsh.internal";
function createClientConnectionBinding(options = {}) {
	const fetch = options.fetch ?? globalThis.fetch;
	const kind = options.kind;
	const baseUrl = options.baseUrl ?? (() => {
		const location = globalThis.location;
		return location?.origin !== void 0 && location.origin !== "null" ? location.origin : INTERNAL_BASE;
	});
	const registrations = /* @__PURE__ */ new Set();
	let current;
	let opening;
	const close = (generation) => {
		if (generation.closed) return;
		generation.closed = true;
		if (current === generation) current = void 0;
		for (const controller of generation.invocations.values()) controller.abort(/* @__PURE__ */ new Error("Connection generation closed"));
		generation.invocations.clear();
	};
	const respond = async (generation, message) => {
		if (generation.closed) return;
		const response = await fetch(new URL(CONNECTION_RESPOND_PATH, baseUrl()), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[CONNECTION_PEER_HEADER]: generation.id,
				[CONNECTION_RPC_HEADER]: message.rpcId
			},
			body: JSON.stringify(message)
		});
		if (!response.ok) throw new Error(`Connection response failed with HTTP ${response.status}`);
	};
	const dispatch = async (generation, message) => {
		if (!isReverseRpcPayload(message.payload)) return;
		const request = message.payload;
		const registration = [...registrations].find((candidate) => candidate.channel === request.channel && candidate.matches(request.endpoint));
		const controller = new AbortController();
		generation.invocations.set(message.rpcId, controller);
		registration?.active.add(controller);
		let result;
		try {
			result = registration === void 0 ? internalFailure(`No Client Connection handler owns ${request.channel}/${request.endpoint}`) : await registration.handler(request.endpoint, request.payload, controller.signal);
		} catch (error) {
			result = internalFailure(error);
		} finally {
			registration?.active.delete(controller);
		}
		if (generation.invocations.get(message.rpcId) !== controller) return;
		generation.invocations.delete(message.rpcId);
		try {
			await respond(generation, {
				type: "client-response",
				rpcId: message.rpcId,
				result
			});
		} catch {
			close(generation);
		}
	};
	return {
		intercept(channel, matches, handler) {
			const registration = {
				channel,
				matches,
				handler,
				active: /* @__PURE__ */ new Set()
			};
			registrations.add(registration);
			return () => {
				registrations.delete(registration);
				for (const controller of registration.active) controller.abort(/* @__PURE__ */ new Error("Client Connection handler disposed"));
				registration.active.clear();
			};
		},
		async open(signal) {
			if (current !== void 0 && !current.closed) return current;
			opening ??= (async () => {
				const response = await fetch(new URL(CONNECTION_OPEN_PATH, baseUrl()), {
					method: "POST",
					...kind === void 0 ? {} : {
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ kind })
					},
					signal
				});
				if (!response.ok) throw new Error(`Connection open failed with HTTP ${response.status}`);
				const body = await response.json();
				if (typeof body.id !== "string" || body.id === "") throw new Error("Connection open returned no peer id");
				const generation = {
					id: body.id,
					closed: false,
					invocations: /* @__PURE__ */ new Map()
				};
				current = generation;
				return generation;
			})().finally(() => {
				opening = void 0;
			});
			return opening;
		},
		release(generation) {
			if (generation !== void 0 && current === generation) close(current);
		},
		handle(message, generation) {
			const active = current;
			if (generation === void 0 || active === void 0 || active !== generation || active.closed) return false;
			if (message.method === "connection.cancel") {
				active.invocations.get(message.rpcId)?.abort(/* @__PURE__ */ new Error("Remote call cancelled"));
				active.invocations.delete(message.rpcId);
				return true;
			}
			if (message.method !== "connection.rpc") return false;
			dispatch(active, message);
			return true;
		}
	};
}
//#endregion
//#region src/client/index.ts
const inject = ["connection", "typert"];
/** Browser entrypoint loaded after the native Connection and Typert registry. */
function apply(ctx) {
	installClientGateway(ctx);
}
//#endregion
exports.apply = apply;
exports.createClientConnectionBinding = createClientConnectionBinding;
exports.inject = inject;
exports.installClientGateway = installClientGateway;

return module.exports;
  },
});
//# sourceMappingURL=client.js.map