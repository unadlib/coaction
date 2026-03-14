[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / SliceState

# Type Alias: SliceState\<T\>

> **SliceState**\<`T`\> = `{ [K in keyof T]: ReturnType<T[K]> }`

Defined in: [src/interface.ts:270](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L270)

Derived state object produced by mapping slice factories to their return
types.

## Type Parameters

### T

`T` _extends_ `Record`\<`string`, [`Slice`](Slice.md)\<`any`\>\>
