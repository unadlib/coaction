[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / Store

# Interface: Store\<T\>

Defined in: [packages/core/src/interface.ts:68](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L68)

Runtime store contract returned by [create](../variables/create.md) before framework-specific
wrappers add selectors or reactivity helpers.

## Remarks

`getState()` returns methods and getters alongside plain data. Methods
extracted from the returned object keep the correct `this` binding when they
are later invoked.

## Extended by

- [`MiddlewareStore`](MiddlewareStore.md)

## Type Parameters

### T

`T` _extends_ [`ISlices`](../type-aliases/ISlices.md) = [`ISlices`](../type-aliases/ISlices.md)

## Properties

### apply()

> **apply**: (`state?`, `patches?`) => `void`

Defined in: [packages/core/src/interface.ts:157](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L157)

Apply patches to the current state.

#### Parameters

##### state?

`T`

##### patches?

`Patches`

#### Returns

`void`

#### Remarks

This is a low-level hook used by transports and middleware. Application
code should generally prefer store methods or `setState()`. Client-side
shared-store mirrors reject direct `apply()` calls.

Both forms publish a commit, so a transition made this way is visible to
`onStoreCommit` and to everything built on it. Where no inverse pair is
supplied one is derived, and a replacement is described by the pair that
turns the previous state into the new one.

With patches, `state` must be the state the store holds -- omit it, or pass
`getPureState()`. A pair describes a change to the current state, so
applying it to anything else leaves the store somewhere its own commits do
not lead, and that is refused.

This belongs to Coaction on every store, including one built through an
external adapter -- the adapter supplies only how to write into its own
runtime -- so middleware that wraps it keeps working. `onStoreCommit` is
still the better hook for observing transitions: it sees every one of them,
including those that never go through `apply`.

---

### destroy()

> **destroy**: () => `void`

Defined in: [packages/core/src/interface.ts:119](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L119)

Tear down the store.

#### Returns

`void`

#### Remarks

`destroy()` is idempotent. It clears subscriptions and disposes any
attached transport.

---

### getInitialState()

> **getInitialState**: () => `T`

Defined in: [packages/core/src/interface.ts:169](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L169)

Return the state produced during initialization before later mutations.

#### Returns

`T`

---

### getPureState()

> **getPureState**: () => `T`

Defined in: [packages/core/src/interface.ts:165](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L165)

Return the current state without methods or getters.

#### Returns

`T`

#### Remarks

Useful for serialization, inspection, or tests that only care about raw
data.

---

### getState()

> **getState**: () => `T`

Defined in: [packages/core/src/interface.ts:105](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L105)

Read the current state object.

#### Returns

`T`

#### Remarks

The returned object includes methods and getters. Methods destructured from
this object continue to execute against the latest store state.

---

### isSliceStore

> **isSliceStore**: `boolean`

Defined in: [packages/core/src/interface.ts:132](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L132)

Whether `createState` was interpreted as a slices object.

---

### name

> **name**: `string`

Defined in: [packages/core/src/interface.ts:72](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L72)

The name of the store.

---

### ~~patch()?~~

> `optional` **patch**: (`option`) => [`PatchTransform`](PatchTransform.md)

Defined in: [packages/core/src/interface.ts:174](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L174)

#### Parameters

##### option

[`PatchTransform`](PatchTransform.md)

#### Returns

[`PatchTransform`](PatchTransform.md)

#### Deprecated

Middleware compatibility hook. Prefer typing middleware stores
with `MiddlewareStore`.

---

### setState()

> **setState**: (`next`, `updater?`) => `void`

Defined in: [packages/core/src/interface.ts:86](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L86)

Mutate the current state.

#### Parameters

##### next

The next partial state, or an updater that mutates a draft.

`DeepPartial`\<`T`\> | (`draft`) => `any` | `null`

##### updater?

(`next`) => \[\] \| \[`T`, `Patches`, `Patches`\]

Low-level updater hook used by transports and middleware integrations.

#### Returns

`void`

#### Remarks

Pass a deep-partial object to merge fields, or pass an updater to edit a
Mutative draft. Draft editing follows Mutative's independent-path semantics
for acyclic shared references. Creating cycles from draft references or
editing inside cyclic drafts is unsupported. Replace a cyclic value with a
complete new value instead; assigning that value inside an updater is also
supported. Use `apply(nextState)` when replacing a cyclic root.
Passing `null` is a no-op. Client-side shared stores intentionally reject
direct `setState()` calls; trigger a store method instead.

---

### share?

> `optional` **share**: `false` \| `"main"` \| `"client"`

Defined in: [packages/core/src/interface.ts:124](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L124)

Indicates whether the store is local, the main shared store, or a client
mirror of a shared store.

---

### subscribe()

> **subscribe**: (`listener`) => () => `void`

Defined in: [packages/core/src/interface.ts:111](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L111)

Subscribe to state changes.

#### Parameters

##### listener

`Listener`

#### Returns

A function that removes the listener.

> (): `void`

##### Returns

`void`

---

### ~~trace()?~~

> `optional` **trace**: (`options`) => `void`

Defined in: [packages/core/src/interface.ts:179](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L179)

#### Parameters

##### options

[`StoreTraceEvent`](StoreTraceEvent.md)

#### Returns

`void`

#### Deprecated

Middleware compatibility hook. Prefer typing middleware stores
with `MiddlewareStore`.

---

### transport?

> `optional` **transport**: `Transport`\<`any`\>

Defined in: [packages/core/src/interface.ts:128](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L128)

Transport used to synchronize a shared store between processes or threads.
