[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Asyncify

# Type Alias: Asyncify\<T, D\>

> **Asyncify**\<`T`, `D`\> = `{ [K in keyof T]: T[K] extends (args: any[]) => any ? (args: Parameters<T[K]>) => Promise<Awaited<ReturnType<T[K]>>> : D extends false ? T[K] : { [P in keyof T[K]]: T[K][P] extends (args: any[]) => any ? (args: Parameters<T[K][P]>) => Promise<Awaited<ReturnType<(...)[(...)][P]>>> : T[K][P] } }`

Defined in: [packages/core/src/interface.ts:432](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L432)

Transform store methods into promise-returning methods for client stores.

## Type Parameters

### T

`T` _extends_ `object`

### D

`D` _extends_ `true` \| `false`
