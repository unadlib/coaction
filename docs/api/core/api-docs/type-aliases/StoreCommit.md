[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / StoreCommit

# Type Alias: StoreCommit\<T\>

> **StoreCommit**\<`T`\> = `object`

Defined in: [packages/core/src/storeCommit.ts:14](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L14)

A patch pair emitted after Coaction has committed an authoritative state
transition.

## Type Parameters

### T

`T` _extends_ `CreateState` = `CreateState`

## Properties

### inversePatches

> `readonly` **inversePatches**: `Patches`

Defined in: [packages/core/src/storeCommit.ts:17](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L17)

---

### patches

> `readonly` **patches**: `Patches`

Defined in: [packages/core/src/storeCommit.ts:16](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L16)

---

### source

> `readonly` **source**: [`StoreCommitSource`](StoreCommitSource.md)

Defined in: [packages/core/src/storeCommit.ts:18](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L18)

---

### state

> `readonly` **state**: `T`

Defined in: [packages/core/src/storeCommit.ts:15](https://github.com/coactionjs/coaction/blob/main/packages/core/src/storeCommit.ts#L15)
