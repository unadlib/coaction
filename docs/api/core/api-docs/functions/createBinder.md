[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / createBinder

# Function: createBinder()

> **createBinder**\<`F`\>(`__namedParameters`): `F`

Defined in: [packages/core/src/binder.ts:89](https://github.com/unadlib/coaction/blob/main/packages/core/src/binder.ts#L89)

Build an adapter helper for bridging an external store implementation into
Coaction.

## Type Parameters

### F

`F` = (...`args`) => `any`

## Parameters

### \_\_namedParameters

[`ExternalStoreAdapterOptions`](../type-aliases/ExternalStoreAdapterOptions.md)\<`F`\>

## Returns

`F`

## Remarks

Official bindings use this to integrate stores such as Redux, Jotai, Pinia,
Zustand, MobX, and Valtio. Binder-backed integrations are whole-store
adapters; they are not compatible with Coaction slices mode.
