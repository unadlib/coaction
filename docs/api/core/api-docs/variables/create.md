[**coaction**](../../index.md)

---

[coaction](../../modules.md) / [api-docs](../index.md) / create

# Variable: create

> `const` **create**: `Creator`

Defined in: [packages/core/src/create.ts:106](https://github.com/unadlib/coaction/blob/main/packages/core/src/create.ts#L106)

Create a local store, the main side of a shared store, or a client mirror of
a shared store.

## Remarks

- Pass a [Slice](../type-aliases/Slice.md) function for a single store.
- Pass an object of slice factories for a slices store.
- When an object input only contains functions, prefer explicit `sliceMode`
  to avoid ambiguous inference.
- When `clientTransport` or `worker` is provided, returned store methods
  become promise-returning methods because execution happens on the main
  shared store.
- New semantics should prefer explicit helpers or variants over adding more
  ambiguous `create()` input forms.
