[**coaction**](../index.md)

---

[coaction](../modules.md) / api-docs

# api-docs

Documentation-only catalog for the root `coaction` entry and its public
`shared`, `adapter`, and `derived` subpaths.

## Remarks

This file is not a runtime entry point. An export appearing here does not
imply that it is available from the package root; see the generated import
map for the owning public subpath.

## Classes

- [ActionAuthorityChangedError](classes/ActionAuthorityChangedError.md)

## Interfaces

- [MiddlewareStore](interfaces/MiddlewareStore.md)
- [PatchTransform](interfaces/PatchTransform.md)
- [Store](interfaces/Store.md)
- [StoreTraceEvent](interfaces/StoreTraceEvent.md)

## Type Aliases

- [Asyncify](type-aliases/Asyncify.md)
- [AsyncStore](type-aliases/AsyncStore.md)
- [ClientStoreOptions](type-aliases/ClientStoreOptions.md)
- [Derived](type-aliases/Derived.md)
- [DerivedOptions](type-aliases/DerivedOptions.md)
- [DeriveOptions](type-aliases/DeriveOptions.md)
- [ExternalStoreAdapterOptions](type-aliases/ExternalStoreAdapterOptions.md)
- [ISlices](type-aliases/ISlices.md)
- [JsonPrimitive](type-aliases/JsonPrimitive.md)
- [JsonValue](type-aliases/JsonValue.md)
- [LocalCreator](type-aliases/LocalCreator.md)
- [LocalStoreOptions](type-aliases/LocalStoreOptions.md)
- [Middleware](type-aliases/Middleware.md)
- [PathValue](type-aliases/PathValue.md)
- [ReactiveTracker](type-aliases/ReactiveTracker.md)
- [Slice](type-aliases/Slice.md)
- [Slices](type-aliases/Slices.md)
- [SliceState](type-aliases/SliceState.md)
- [StoreOptions](type-aliases/StoreOptions.md)
- [TransportPolicy](type-aliases/TransportPolicy.md)
- [TransportPolicyRequest](type-aliases/TransportPolicyRequest.md)

## Variables

- [create](variables/create.md)
- [createLocal](variables/createLocal.md)

## Functions

- [computed](functions/computed.md)
- [createBinder](functions/createBinder.md)
- [createReactiveTracker](functions/createReactiveTracker.md)
- [defineExternalStoreAdapter](functions/defineExternalStoreAdapter.md)
- [derive](functions/derive.md)
- [derivePath](functions/derivePath.md)
- [effect](functions/effect.md)
- [effectScope](functions/effectScope.md)
- [endBatch](functions/endBatch.md)
- [identity](functions/identity.md)
- [isComputed](functions/isComputed.md)
- [isEffect](functions/isEffect.md)
- [isEffectScope](functions/isEffectScope.md)
- [isSignal](functions/isSignal.md)
- [signal](functions/signal.md)
- [startBatch](functions/startBatch.md)
- [trigger](functions/trigger.md)
- [wrapStore](functions/wrapStore.md)
