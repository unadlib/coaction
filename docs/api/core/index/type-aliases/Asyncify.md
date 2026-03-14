[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [index](../index.md) / Asyncify

# Type Alias: Asyncify\<T, D\>

> **Asyncify**\<`T`, `D`\> = `{ [K in keyof T]: T[K] extends (args: any[]) => any ? (args: Parameters<T[K]>) => Promise<ReturnType<T[K]>> : D extends false ? T[K] : { [P in keyof T[K]]: T[K][P] extends (args: any[]) => any ? (args: Parameters<T[K][P]>) => Promise<ReturnType<T[K][P]>> : T[K][P] } }`

Defined in: [src/interface.ts:375](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L375)

Transform store methods into promise-returning methods for client stores.

## Type Parameters

### T

`T` _extends_ `object`

### D

`D` _extends_ `true` \| `false`
