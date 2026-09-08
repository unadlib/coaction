[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / identity

# Function: identity()

> **identity**\<`T`\>(`value`): `T`

Defined in: [packages/core/src/derived.ts:231](https://github.com/coactionjs/coaction/blob/main/packages/core/src/derived.ts#L231)

Mark a state object identity without unwrapping its readonly view.

## Type Parameters

### T

`T`

## Parameters

### value

`T`

## Returns

`T`

## Remarks

Import from `coaction/derived`. Use inside deep selectors before comparing
objects, using them as WeakMap keys, or capturing them in opaque output values.
Unlike whole(), this preserves the public readonly object's identity.
