# The Binding of DSH

[![Powered by Harmony](https://memorax-ai.github.io/dsh-harmony/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)

[English](README.md) | [简体中文](README.zh-CN.md)

一个通过 DSH 原生 Connection 和 Typert Gateway，在 Host 与 Client 之间提供双向 RPC 的 DSH 插件。

## 功能

- 向已连接的浏览器或 Node peer 发起定向 Host-to-Client 调用。
- 支持双向 Typert Gateway 调用。
- 处理请求关联、取消和连接生命周期。
- Typert RPC 的请求、结果与取消共用原生 `events.host` WebSocket。
- 原生 mux 事件和 bulk HTTP API 保持原有传输方式。

插件不会引入并行载体。Connection 仍负责 peer 寻址和连接生命周期，Typert Gateway 仍负责服务描述、编解码、调用和错误处理。

## 安装

```sh
npm install the-binding-of-dsh
```

包已在 `package.json` 中声明 DSH 客户端入口和 Harmony patch，因此可以作为常规 DSH 插件启用。Harmony 0.8.6
及以上版本会自动推导 Connection patch 引入的浏览器模块依赖，并安排 Binding 模块的加载顺序。

## 开发

需要 Node.js 22.22.3 或更高版本。

```sh
npm install
npm run check
```

## 许可证

MIT
