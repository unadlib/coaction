[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / DerivedOptions

# Type Alias: DerivedOptions\<T\>

> **DerivedOptions**\<`T`\> = `object`

Defined in: [packages/core/src/derived.ts:44](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L44)

Optional result equality, separate from dependency tracking.

## Type Parameters

### T

`T`

## Properties

### equals()?

> `optional` **equals**: (`previous`, `next`) => `boolean`

Defined in: [packages/core/src/derived.ts:50](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L50)

Defaults to Object.is. Returning true reuses the previous result. The
comparator must be pure and runs without recording reactive dependencies.
Changes inside a returned live state facade still propagate.

#### Parameters

##### previous

`T`

##### next

`T`

#### Returns

`boolean`
