[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StoreTraceEvent

# Interface: StoreTraceEvent

Defined in: [packages/core/src/interface.ts:36](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L36)

Trace envelope emitted before and after a store method executes.

## Properties

### id

> **id**: `string`

Defined in: [packages/core/src/interface.ts:40](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L40)

The id of the method.

---

### method

> **method**: `string`

Defined in: [packages/core/src/interface.ts:44](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L44)

The method name.

---

### parameters?

> `optional` **parameters**: `any`[]

Defined in: [packages/core/src/interface.ts:52](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L52)

The parameters of the method.

---

### result?

> `optional` **result**: `any`

Defined in: [packages/core/src/interface.ts:56](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L56)

The result of the method.

---

### sliceKey?

> `optional` **sliceKey**: `PropertyKey`

Defined in: [packages/core/src/interface.ts:48](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L48)

The slice key.
