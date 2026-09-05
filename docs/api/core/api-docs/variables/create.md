[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / create

# Variable: create

> `const` **create**: `Creator`

Defined in: [packages/core/src/create.ts:116](https://github.com/coactionjs/coaction/blob/main/packages/core/src/create.ts#L116)

Create a local store, the main side of a shared store, or a client mirror of
a shared store.

## Remarks

Prefer the default `coaction` entry when transport support is not
required. It excludes the JSON protocol and reconnect runtime from the
consumer dependency graph.

When client options (`worker` / `clientTransport`) are provided but no
transport is available at runtime, the store degrades to a strict local
authority. Its `getState()` actions still return promises and its values
obey the shared JSON contract:

```ts
const worker =
  typeof SharedWorker !== 'undefined'
    ? new SharedWorker(new URL('./worker.ts', import.meta.url), {
        type: 'module'
      })
    : undefined;

// StoreWithAsyncFunction<T> whether or not the worker exists.
const store = create(slice, { worker });
await store.getState().action();
```
