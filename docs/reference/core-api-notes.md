# Core API Notes

## `create()` Input Shapes

`create()` accepts either a single store factory or an object of slice
factories. The object form becomes ambiguous when every enumerable value is a
function, because it can mean either:

- a plain store object that only exposes methods
- a slices object where each property is a slice factory

For that reason, use `sliceMode: 'single'` or `sliceMode: 'slices'` explicitly
for function maps.

## Local/Main Stores vs Client Stores

Passing `transport` creates the main/shared store. Passing `clientTransport` or
`worker` creates a client mirror of that shared store.

Client stores have two important differences:

- store methods return promises because execution happens on the main store
- direct `setState()` calls are rejected on the client; mutate through a store
  method instead

## `getState()` Method Binding

Store methods and slice methods are rebound to the latest state object when
they are invoked. This makes patterns like the following safe even when the
method body relies on `this`:

```ts
const { increment } = store.getState();
increment();
```

The same rule applies to slices:

```ts
const { increment } = store.getState().counter;
increment();
```

## `createBinder()` Boundaries

`createBinder()` is intended for whole-store adapters that bridge external state
systems such as Redux, Zustand, Jotai, Pinia, MobX, or Valtio.

Binder-backed stores are not compatible with Coaction slices mode. If an
external integration should live under a slice key, wrap the entire external
store instead of mixing it into a slices object.

## API Evolution Boundary

`create()` should be treated as a closed polymorphic surface, not an open-ended
bucket for new semantics.

What that means in practice:

- do not mix main-store and client-store transport settings in one call
- do not pass multiple client transport sources in one call
- prefer explicit helpers or `createXxx` variants for future expansion instead
  of new ambiguous overloads

The compatibility-only `workerType` options remain available, but they are not
the preferred path for new API design.
