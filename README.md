# viem-tracer

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

Debug transactions via traces by automatically decoding them with the help of [openchain.xyz](https://openchain.xyz/)!

- Automatically append traces to error messages of failed `eth_estimateGas` and `eth_sendTransaction` RPC requests.
- Add support for [`debug_traceCall`](https://www.quicknode.com/docs/ethereum/debug_traceCall) to a Viem client with correct types!

## Installation

```bash
npm install viem-tracer
```

```bash
yarn add viem-tracer
```

## Usage

```typescript
import { createTestClient, http } from 'viem';
import { foundry } from 'viem/chains';
import { traceActions, traced } from 'viem-tracer';

const client = createTestClient({
  mode: 'anvil',
  chain: foundry,
  transport: traced( // Automatically trace failed transactions (or programmatically)
    http(),
    { all: false, next: false, failed: true } // Optional, default tracer config
  ),
}).extend(traceActions); // Extend client with the `client.traceCall` action

// Returns the call trace as formatted by the requested tracer.
await client.traceCall({
   account: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
   to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
   value: parseEther('1'),
   // tracer: "prestateTracer", // Defaults to "callTracer".
});

// Failing `eth_estimateGas` and `eth_sendTransaction` RPC requests will automatically append the transaction traces to the error:

// 0 ↳ FROM 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
// 0 ↳ CALL (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48).transfer(0xf39F...0xf3, 100000000) -> ERC20: transfer amount exceeds balance
//   1 ↳ DELEGATECALL (0x43506849D7C04F9138D1A2050bbF3A0c054402dd).transfer(0xf39F...0xf3, 100000000) -> ERC20: transfer amount exceeds balance

client.transport.tracer.all = true; // If you want to trace all submitted transactions, failing or not.
client.transport.tracer.next = true; // If you want to trace the next submitted transaction.

```

> [!NOTE]  
> You can disable colors via the `colors` package:
> ```typescript
> import { disable } from "colors";
>
> disable();
> ```


[build-img]: https://github.com/rubilmax/viem-tracer/actions/workflows/release.yml/badge.svg
[build-url]: https://github.com/rubilmax/viem-tracer/actions/workflows/release.yml
[downloads-img]: https://img.shields.io/npm/dt/viem-tracer
[downloads-url]: https://www.npmtrends.com/viem-tracer
[npm-img]: https://img.shields.io/npm/v/viem-tracer
[npm-url]: https://www.npmjs.com/package/viem-tracer
[issues-img]: https://img.shields.io/github/issues/rubilmax/viem-tracer
[issues-url]: https://github.com/rubilmax/viem-tracer/issues
[codecov-img]: https://codecov.io/gh/rubilmax/viem-tracer/branch/main/graph/badge.svg
[codecov-url]: https://codecov.io/gh/rubilmax/viem-tracer
[semantic-release-img]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[semantic-release-url]: https://github.com/semantic-release/semantic-release
[commitizen-img]: https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[commitizen-url]: http://commitizen.github.io/cz-cli/
