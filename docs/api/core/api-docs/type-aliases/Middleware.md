[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Middleware

# Type Alias: Middleware()\<T\>

> **Middleware**\<`T`\> = (`store`) => [`MiddlewareStore`](../interfaces/MiddlewareStore.md)\<`T`\>

Defined in: [packages/core/src/interface.ts:279](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L279)

Store enhancer invoked during store creation.

## Type Parameters

### T

`T` _extends_ `CreateState`

## Parameters

### store

[`MiddlewareStore`](../interfaces/MiddlewareStore.md)\<`T`\>

## Returns

[`MiddlewareStore`](../interfaces/MiddlewareStore.md)\<`T`\>

## Remarks

Middleware may mutate the received store in place or return a replacement
store object, but it must preserve the [Store](../interfaces/Store.md) contract.
