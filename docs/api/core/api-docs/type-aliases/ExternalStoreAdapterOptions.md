[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / ExternalStoreAdapterOptions

# Type Alias: ExternalStoreAdapterOptions\<F\>

> **ExternalStoreAdapterOptions**\<`F`\> = `object`

Defined in: [packages/core/src/binder.ts:5](https://github.com/unadlib/coaction/blob/main/packages/core/src/binder.ts#L5)

## Type Parameters

### F

`F` = (...`args`) => `any`

## Properties

### handleState()

> **handleState**: \<`T`\>(`state`) => `object`

Defined in: [packages/core/src/binder.ts:10](https://github.com/unadlib/coaction/blob/main/packages/core/src/binder.ts#L10)

Normalize a third-party store instance into a raw state object plus the
binding hook used during initialization.

#### Type Parameters

##### T

`T` _extends_ `object` = `object`

#### Parameters

##### state

`T`

#### Returns

##### bind()

> **bind**: (`state`) => `T`

Convert the external state object into the raw state shape used by
Coaction.

###### Parameters

###### state

`T`

###### Returns

`T`

##### copyState

> **copyState**: `T`

Copy of the incoming state object that Coaction should consume.

##### key?

> `optional` **key**: keyof `T`

Optional nested key when the adapter exposes a single child object from
the third-party store.

---

### handleStore()

> **handleStore**: (`store`, `rawState`, `state`, `internal`, `key?`) => `void`

Defined in: [packages/core/src/binder.ts:31](https://github.com/unadlib/coaction/blob/main/packages/core/src/binder.ts#L31)

Wire Coaction's store lifecycle to the external store implementation.

#### Parameters

##### store

[`Store`](../interfaces/Store.md)\<`object`\>

##### rawState

`object`

##### state

`object`

##### internal

`Internal`\<`object`\>

##### key?

`string`

#### Returns

`void`
