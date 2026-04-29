[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StoreTraceEvent

# Interface: StoreTraceEvent

Defined in: [packages/core/src/interface.ts:33](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L33)

Trace envelope emitted before and after a store method executes.

## Properties

### id

> **id**: `string`

Defined in: [packages/core/src/interface.ts:37](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L37)

The id of the method.

---

### method

> **method**: `string`

Defined in: [packages/core/src/interface.ts:41](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L41)

The method name.

---

### parameters?

> `optional` **parameters**: `any`[]

Defined in: [packages/core/src/interface.ts:49](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L49)

The parameters of the method.

---

### result?

> `optional` **result**: `any`

Defined in: [packages/core/src/interface.ts:53](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L53)

The result of the method.

---

### sliceKey?

> `optional` **sliceKey**: `string`

Defined in: [packages/core/src/interface.ts:45](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L45)

The slice key.
