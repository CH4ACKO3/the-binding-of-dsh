# The Binding of DSH

Bidirectional service calls over the existing DSH Connection and Typert Gateway.

The plugin will add targeted Host-to-Client calls, a symmetric Typert Gateway,
and a Node peer client without introducing another RPC transport. Its first
consumer is [dsh-webui-studio](https://github.com/CH4ACKO3/dsh-webui-studio).

## Status

Phase 2 implements bidirectional Connection RPC and a symmetric Typert Gateway:

- generation-scoped peer discovery and explicit Host targeting;
- Host requests over the existing host WebSocket downlink;
- Client responses over the existing `/api/respond` leg;
- Client handler registration, cancellation, and disposal;
- pending-call rejection when either downlink closes.
- one shared local Typert dispatcher on Host and Client;
- strict descriptor, argument, lookup, Context, result, and error handling;
- a generated Host Remote selected explicitly with `ctx.remote.for(peer)`.
- a Node peer client using the same HTTP and two-WebSocket Connection carrier.

The Harmony Patch targets the supported DSH release range and keeps protocol
logic in this package. Studio route migration is the next phase.

## Development

Requires Node.js 22.22.3 or newer.

```sh
npm install
npm run check
```

The implementation follows three boundaries:

- Connection owns transport, peer addressing, request correlation, cancellation,
  and connection teardown.
- Typert Gateway owns descriptors, invocation, codecs, lookups, and RPC errors.
- Consumers such as Studio expose ordinary Cordis Services and do not create a
  parallel transport.

Validation and request trust should match the native DSH Connection behavior.
Compatibility is declared as a tested SemVer range rather than an exact release.
