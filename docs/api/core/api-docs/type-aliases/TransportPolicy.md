[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / TransportPolicy

# Type Alias: TransportPolicy

> **TransportPolicy** = `object`

Defined in: [packages/core/src/interface.ts:197](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L197)

## Properties

### allowedActions?

> `optional` **allowedActions**: readonly readonly `string`[][]

Defined in: [packages/core/src/interface.ts:199](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L199)

Further restrict action paths declared by the authoritative store.

---

### authorize()?

> `optional` **authorize**: (`request`) => `boolean` \| `Promise`\<`boolean`\>

Defined in: [packages/core/src/interface.ts:201](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L201)

Authorize a decoded JSON request before serving it.

#### Parameters

##### request

[`TransportPolicyRequest`](TransportPolicyRequest.md)

#### Returns

`boolean` \| `Promise`\<`boolean`\>

---

### mapError()?

> `optional` **mapError**: (`error`, `request`) => `string` \| `undefined` \| `Promise`\<`string` \| `undefined`\>

Defined in: [packages/core/src/interface.ts:206](https://github.com/coactionjs/coaction/blob/main/packages/core/src/interface.ts#L206)

Map a caught execute error to an explicitly client-visible message.
Returning `undefined` keeps the generic redacted message.

#### Parameters

##### error

`unknown`

##### request

[`TransportPolicyRequest`](TransportPolicyRequest.md)

#### Returns

`string` \| `undefined` \| `Promise`\<`string` \| `undefined`\>
