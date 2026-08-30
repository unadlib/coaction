# Zustand-Focused Benchmarks

This document records the benchmark scenarios used when positioning Coaction against Zustand. The numbers should be regenerated locally before publishing a claim, because JavaScript microbenchmarks vary by runtime, CPU, package version, and state shape.

## Existing Update Benchmark

The root README chart is generated from:

```sh
pnpm benchmark
```

That benchmark compares update throughput for:

- Coaction object replacement
- Coaction mutable draft updates through Mutative
- Zustand object replacement
- Zustand with Immer

It is useful for explaining why Coaction can keep mutable update DX without following Zustand's Immer performance profile.

## Derived-State Positioning Benchmark

Run:

```sh
pnpm benchmark:zustand-positioning
```

The script covers two scenarios:

- stable derived reads
- update then read derived value

The comparison includes:

- Coaction accessor getter cached by the built-in `alien-signals` runtime
- Coaction `get(deps, selector)` computed value
- Zustand selector that recomputes derived data
- Zustand manually maintained `total` field

The maintained Zustand field is included intentionally. It is the fastest way to read a derived value in Zustand, but it shifts consistency work into actions. Coaction's value proposition is that cached derived state is part of the store runtime instead of a field that application code must keep synchronized.

The update-plus-read cases also enforce Coaction's immutable public-state
boundary. External reads remain behind readonly proxies so actions cannot
mutate nested values outside `set()`. Cached getter evaluation uses a separate
frozen snapshot: its first evaluation snapshots the immutable state and later
updates apply only the paths reported by Mutative. This keeps computed traversal
safe without paying one proxy trap per array element and field. Stable cached
reads and large Mutative updates remain separate cases so regressions in those
paths are visible independently.

The protected-read implementation was measured before and after the snapshot
change on the same machine. The two update-plus-read cases moved from roughly
5,900 ops/sec to about 50,000–65,000 ops/sec, while the large update case
remained independently gated. The cached snapshot adds about 0.9 KiB gzip to
the local entry. These numbers document the reviewed performance/size tradeoff;
they are not cross-machine performance claims.

## Reading these numbers

Every figure in this document and in the README comes from a **single run** of
`pnpm benchmark:zustand-positioning` on one machine (Apple M1 Max, Node 24.16,
`zustand@5.0.11`). Run-to-run spread on that suite is roughly ±1% for the stable read cases and
as much as ±19% for the object-replacement case, so the trailing digits carry no meaning: quote
the order of magnitude and the ratio, not the exact value.

Mixing figures from different runs is how these documents drifted out of agreement once already.
When you refresh them, refresh every table from the same run and update the README in the same
change.

## The object-payload write path

`set({ ... })` behaves differently from `set((draft) => { ... })`, and the difference has two
separate causes. One was a defect and is fixed; the other is the cost of a deliberate guarantee.

### Fixed: cloning the current root was deep

The object-payload commit copied the store's existing root state with a helper that ran every
value through `sanitizeReplacementState`, a deep recursive clone. That made **every**
`set({ ... })` O(total state size) — replacing one scalar cost the same as replacing everything,
because untouched fields were re-cloned on each commit.

Replacing a single scalar in a store that merely holds a 10,000-item array, 400 operations:

|                    |   before | after |
| :----------------- | -------: | ----: |
| `set({ counter })` | 1,591 ms |  2 ms |

The store already owns and already sanitized its current state, so re-sanitizing it on every
commit was redundant. `shallowCloneOwnEnumerable` now copies those own enumerable keys directly;
nested values keep their identity, matching the structural sharing the Mutative draft path
already relies on. Incoming payloads are unaffected — see below.
`Coaction unrelated field replacement` gates this path.

### By design: the incoming payload is deep-sanitized

Whatever you hand to `set({ ... })` is caller-supplied data. It is deep-cloned to strip unsafe
keys and to break aliasing with objects the caller still holds, so passing in a fresh
1,000-element array costs O(payload). Measured on an Apple M1 Max with a 1,000-item cart:

| Update path                                | ops/sec |
| :----------------------------------------- | ------: |
| `set((draft) => { ... })` (Mutative draft) |  43,918 |
| `set({ items })` (object replacement)      |     342 |

This is not a defect and cannot be optimized away without weakening the guarantee. Coaction 1.5.0
looks dramatically faster here only because it did not make that guarantee; the sanitizer arrived
in 2.0.0. `Coaction object replacement + cached getter` gates this path so it cannot get worse.

**Practical rule: prefer `set((draft) => { ... })` whenever the value you are writing is large.**
The draft path lets Mutative report precise patches, so neither the payload walk nor the cached
getter's snapshot rebuild is needed.

The blocking regression check uses the transport-free `coaction/local` entry:

```sh
pnpm build
pnpm benchmark:check
```

Its thresholds are regression floors with headroom for CI variance, not
publishable performance claims. Any threshold change requires a reviewed
runtime-semantic or benchmark-methodology change; a failing gate must not be
silenced by rebaselining alone.

## How to Interpret Results

Do not publish one benchmark as a universal statement that one library is always faster.

Use the update benchmark for this claim:

> Coaction's built-in mutable update path can avoid the cost profile of Zustand + Immer in large immutable updates.

Use the derived-state benchmark for this claim:

> Coaction has a built-in cached derived-state runtime. Zustand can match constant-time reads by manually storing derived values, but the application must maintain those values consistently.

## Future Benchmark Candidates

The next useful comparisons are:

- React rerender count for unrelated updates
- selector-heavy component trees
- bundle size for minimal stores and feature-rich stores
- worker/shared-mode round trip latency
- adapter write propagation for `@coaction/zustand`

Keep benchmark scripts small and source-controlled. Generated images should only be committed when the README or documentation references their exact numbers.
