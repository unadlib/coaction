[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [index](../index.md) / createBinder

# Function: createBinder()

> **createBinder**\<`F`\>(`__namedParameters`): `F`

Defined in: [src/binder.ts:14](https://github.com/unadlib/coaction/blob/main/packages/core/src/binder.ts#L14)

Build an adapter helper for bridging an external store implementation into
Coaction.

## Type Parameters

### F

`F` = (...`args`) => `any`

## Parameters

### \_\_namedParameters

#### handleState

\<`T`\>(`state`) => `object`

Normalize a third-party store instance into a raw state object plus the
binding hook used during initialization.

#### handleStore

(`store`, `rawState`, `state`, `internal`, `key?`) => `void`

Wire Coaction's store lifecycle to the external store implementation.

## Returns

`F`

## Remarks

Official bindings use this to integrate stores such as Redux, Jotai, Pinia,
Zustand, MobX, and Valtio. Binder-backed integrations are whole-store
adapters; they are not compatible with Coaction slices mode.
