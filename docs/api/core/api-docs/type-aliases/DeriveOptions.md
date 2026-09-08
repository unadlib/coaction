[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / DeriveOptions

# Type Alias: DeriveOptions\<T\>

> **DeriveOptions**\<`T`\> = [`DerivedOptions`](DerivedOptions.md)\<`T`\> & `object`

Defined in: [packages/core/src/derived.ts:54](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L54)

Controls automatic dependency selection and result equality.

## Type Declaration

### deep?

> `optional` **deep**: `boolean`

Opt into leaf/structure tracking. Default false preserves all traversed
object identities. With deep enabled, mark identity observations with
identity(value); JavaScript equality and WeakMap lookups have no proxy trap.

## Type Parameters

### T

`T`
