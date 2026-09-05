[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StoreTraceEvent

# Interface: StoreTraceEvent

Defined in: [packages/core/src/interface.ts:35](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L35)

Trace envelope emitted before and after a store method executes.

## Properties

### id

> **id**: `string`

Defined in: [packages/core/src/interface.ts:39](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L39)

The id of the method.

---

### method

> **method**: `string`

Defined in: [packages/core/src/interface.ts:43](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L43)

The method name.

---

### parameters?

> `optional` **parameters**: `any`[]

Defined in: [packages/core/src/interface.ts:51](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L51)

The parameters of the method.

---

### result?

> `optional` **result**: `any`

Defined in: [packages/core/src/interface.ts:55](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L55)

The result of the method.

---

### sliceKey?

> `optional` **sliceKey**: `PropertyKey`

Defined in: [packages/core/src/interface.ts:47](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L47)

The slice key.
