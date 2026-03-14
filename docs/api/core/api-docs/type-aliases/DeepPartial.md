[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / DeepPartial

# Type Alias: DeepPartial\<T\>

> **DeepPartial**\<`T`\> = `{ [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }`

Defined in: [src/interface.ts:13](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L13)

Recursive partial object accepted by [Store.setState](../interfaces/Store.md#setstate) when merging a
plain object payload into the current state tree.

## Type Parameters

### T

`T`
