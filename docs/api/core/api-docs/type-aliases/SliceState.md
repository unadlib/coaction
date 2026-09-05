[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / SliceState

# Type Alias: SliceState\<T\>

> **SliceState**\<`T`\> = `{ [K in keyof T]: ReturnType<T[K]> }`

Defined in: [packages/core/src/interface.ts:287](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L287)

Derived state object produced by mapping slice factories to their return
types.

## Type Parameters

### T

`T` _extends_ `Record`\<`PropertyKey`, [`Slice`](Slice.md)\<`any`\>\>
