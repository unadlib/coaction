[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [index](../index.md) / ClientTransportOptions

# Interface: ClientTransportOptions

Defined in: [src/interface.ts:346](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L346)

Transport-related options for client/shared-store mirrors.

## Properties

### clientTransport?

> `optional` **clientTransport**: `Transport`\<`any`\>

Defined in: [src/interface.ts:365](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L365)

Inject a pre-built client transport.

---

### executeSyncTimeoutMs?

> `optional` **executeSyncTimeoutMs**: `number`

Defined in: [src/interface.ts:361](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L361)

How long the client should wait for sequence catch-up before falling back
to `fullSync`.

Increase this when worker-side execution can complete before the matching
incremental `update` message arrives under heavy load.

#### Default

```ts
1500;
```

---

### worker?

> `optional` **worker**: `SharedWorker` \| `Worker`

Defined in: [src/interface.ts:369](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L369)

Build a client transport from a Worker or SharedWorker instance.

---

### ~~workerType?~~

> `optional` **workerType**: `"WebWorkerClient"` \| `"SharedWorkerClient"`

Defined in: [src/interface.ts:351](https://github.com/unadlib/coaction/blob/main/packages/core/src/interface.ts#L351)

#### Deprecated

Internal worker-mode override retained for compatibility.
Prefer passing `clientTransport` or `worker`.
