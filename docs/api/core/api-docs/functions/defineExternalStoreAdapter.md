[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / defineExternalStoreAdapter

# Function: defineExternalStoreAdapter()

> **defineExternalStoreAdapter**\<`F`\>(`options`): `F`

Defined in: [packages/core/src/binder.ts:107](https://github.com/unadlib/coaction/blob/main/packages/core/src/binder.ts#L107)

Define a whole-store adapter for integrating an external state runtime with
Coaction.

## Type Parameters

### F

`F` = (...`args`) => `any`

## Parameters

### options

[`ExternalStoreAdapterOptions`](../type-aliases/ExternalStoreAdapterOptions.md)\<`F`\>

## Returns

`F`

## Remarks

This is the stable 2.x name for adapter authors. `createBinder()` remains as
a compatibility alias for existing official and community integrations.
