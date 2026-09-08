[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Derived

# Type Alias: Derived()\<T\>

> **Derived**\<`T`\> = `T`

Defined in: [packages/core/src/derived.ts:21](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L21)

A lazy store-owned derived read. Dispose it when its owner no longer needs it.

## Type Parameters

### T

`T`

> **Derived**(): `T`

A lazy store-owned derived read. Dispose it when its owner no longer needs it.

## Returns

`T`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [packages/core/src/derived.ts:24](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L24)

Release dependencies and cached values. Further reads throw. Idempotent.

#### Returns

`void`
