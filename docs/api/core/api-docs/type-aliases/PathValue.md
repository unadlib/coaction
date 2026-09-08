[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / PathValue

# Type Alias: PathValue\<T, P\>

> **PathValue**\<`T`, `P`\> = `P` _extends_ readonly \[\] ? `T` : `P` _extends_ readonly \[infer K, `...(infer Rest extends PropertyKey[])`\] ? `T` _extends_ `null` \| `undefined` ? `undefined` : `K` _extends_ keyof `T` ? `PathValue`\<`T`\[`K`\], `Rest`\> : `undefined` : `unknown`

Defined in: [packages/core/src/derived.ts:28](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L28)

The value selected by a tuple of state keys, including optional parents.

## Type Parameters

### T

`T`

### P

`P` _extends_ readonly `PropertyKey`[]
