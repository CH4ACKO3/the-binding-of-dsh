# The Binding of DSH

[![Powered by Harmony](https://memorax-ai.github.io/dsh-harmony/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)

[English](README.md) | [简体中文](README.zh-CN.md)

A DSH plugin that enables bidirectional RPC between Host and Client through the
native DSH Connection and Typert Gateway.

## Features

- Targeted Host-to-Client calls for connected browser or Node peers.
- Symmetric Typert Gateway calls in both directions.
- Request correlation, cancellation, and connection lifecycle handling.
- Typert RPC requests, results, and cancellation share the native `events.host` WebSocket.
- Native mux events and bulk HTTP APIs keep their original transport.

The plugin adds no parallel carrier. Connection remains responsible for peer
addressing and lifecycle, while Typert Gateway remains responsible for service
descriptors, codecs, invocation, and errors.

## Installation

```sh
npm install the-binding-of-dsh
```

The package declares its DSH client entrypoint and Harmony patches in
`package.json`, so it can be enabled as a regular DSH plugin. Harmony 0.8.6 or
newer derives the browser module dependency introduced by the Connection patch
and orders the Binding module automatically.

## Development

Requires Node.js 22.22.3 or newer.

```sh
npm install
npm run check
```

## License

MIT
