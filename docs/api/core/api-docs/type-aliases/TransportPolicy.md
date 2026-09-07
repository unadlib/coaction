[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / TransportPolicy

# Type Alias: TransportPolicy

> **TransportPolicy** = `object`

Defined in: [packages/core/src/interface.ts:219](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L219)

## Properties

### allowedActions?

> `optional` **allowedActions**: readonly readonly `string`[][]

Defined in: [packages/core/src/interface.ts:221](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L221)

Further restrict action paths declared by the authoritative store.

---

### authorize()?

> `optional` **authorize**: (`request`) => `boolean` \| `Promise`\<`boolean`\>

Defined in: [packages/core/src/interface.ts:223](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L223)

Authorize a decoded JSON request before serving it.

#### Parameters

##### request

[`TransportPolicyRequest`](TransportPolicyRequest.md)

#### Returns

`boolean` \| `Promise`\<`boolean`\>

---

### mapError()?

> `optional` **mapError**: (`error`, `request`) => `string` \| `undefined` \| `Promise`\<`string` \| `undefined`\>

Defined in: [packages/core/src/interface.ts:228](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L228)

Map a caught execute error to an explicitly client-visible message.
Returning `undefined` keeps the generic redacted message.

#### Parameters

##### error

`unknown`

##### request

[`TransportPolicyRequest`](TransportPolicyRequest.md)

#### Returns

`string` \| `undefined` \| `Promise`\<`string` \| `undefined`\>
