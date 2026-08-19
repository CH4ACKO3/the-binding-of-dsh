# The Binding of DSH

Bidirectional service calls over the existing DSH Connection and Typert Gateway.

The plugin will add targeted Host-to-Client calls, a symmetric Typert Gateway,
and a Node peer client without introducing another RPC transport. Its first
consumer is [dsh-webui-studio](https://github.com/CH4ACKO3/dsh-webui-studio).

## Status

The repository currently contains the Host and browser plugin entrypoints,
Harmony installation metadata, and the build/test workspace. Connection and
Gateway patches will be implemented incrementally against the supported DSH
release range.

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
