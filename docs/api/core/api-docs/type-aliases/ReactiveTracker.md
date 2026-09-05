[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / ReactiveTracker

# Type Alias: ReactiveTracker

> **ReactiveTracker** = `object`

Defined in: [packages/core/src/reactiveTracker.ts:26](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L26)

## Properties

### dispose()

> **dispose**: () => `void`

Defined in: [packages/core/src/reactiveTracker.ts:31](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L31)

#### Returns

`void`

---

### getSnapshot()

> **getSnapshot**: () => `number`

Defined in: [packages/core/src/reactiveTracker.ts:27](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L27)

#### Returns

`number`

---

### hasDependencies()

> **hasDependencies**: () => `boolean`

Defined in: [packages/core/src/reactiveTracker.ts:28](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L28)

#### Returns

`boolean`

---

### subscribe()

> **subscribe**: (`listener`) => () => `void`

Defined in: [packages/core/src/reactiveTracker.ts:29](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L29)

#### Parameters

##### listener

() => `void`

#### Returns

> (): `void`

##### Returns

`void`

---

### track()

> **track**: \<`T`\>(`fn`) => `T`

Defined in: [packages/core/src/reactiveTracker.ts:30](https://github.com/coactionjs/coaction/blob/main/packages/core/src/reactiveTracker.ts#L30)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `T`

#### Returns

`T`
