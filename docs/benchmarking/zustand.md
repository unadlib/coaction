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
scalar updates carry forward the affected paths; object replacements build frozen snapshots from the committed values. This keeps computed traversal
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

The original derived-positioning figures and README chart came from a **single run** of
`pnpm benchmark:zustand-positioning` on one machine (Apple M1 Max, Node 24.16,
`zustand@5.0.11`). Run-to-run spread on that suite is roughly ±1% for the stable read cases and
as much as ±19% for the object-replacement case, so the trailing digits carry no meaning: quote
the order of magnitude and the ratio, not the exact value.

The current write-cost tables below instead come from one `pnpm benchmark:check`
run at runtime commit `6774dec` (Apple M1 Max, Node 24.16.0, Mutative 1.3.0).
Keep these workloads separate when quoting results; refreshing positioning or
README claims requires rerunning their own scripts.

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

The object form clones incoming plain containers to strip unsafe keys and isolate
state from subsequent caller mutation. It preserves cycles and shared references
within the payload; non-plain atomic values retain their identities. Passing a
fresh 1,000-element array therefore still costs O(payload). Normalization now
uses one array traversal and shares its implementation with initialization.

The current gate separates input form, observation, and public-state reads:

| Update path over 1,000 cart items                       | ops/sec |
| :------------------------------------------------------ | ------: |
| Draft field edit, then cached getter                    |  51,225 |
| Object replacement via public state, then cached getter |     149 |
| Object replacement via raw state, nothing watching      |   4,740 |
| Recipe replacement via raw state, nothing watching      | 878,158 |

The two unobserved cases build the same array from `getPureState()`. Only the
object form performs the incoming-container clone in that mode. With a getter
or commit observer, object-valued patches require additional normalization and
snapshot work even when assigned inside a recipe. The public-state replacement
case also reads readonly proxies and showed about ±26% uncertainty in this run;
these rows cannot attribute every difference to the input clone alone.

**Prefer editing fields inside `set((draft) => { ... })` for large state.**
Mutative can report small patches while retaining unchanged subtrees. Replacing
an entire array inside a recipe is a different workload, and does not promise
the same performance under observation.

### Tracking still costs writes, but redundant work was removable

Commit listeners request patch pairs; reactive path readers need patches for
invalidation. Ordinary `subscribe()` listeners need neither. The native scalar
path now commits the verified Mutative result without replaying it, and a single
scalar replacement carries the frozen getter snapshot forward without drafting
that snapshot again. Patch transforms, adapters and complex patch shapes retain
the general commit path.

| Observation before writes | Writes/sec |
| :------------------------ | ---------: |
| Nothing watching          |    459,024 |
| Plain subscriber          |    451,175 |
| Commit listener           |    332,094 |
| Path effect               |    305,415 |
| Getter read once          |    170,546 |

These are write-only cases after setup, not repeated getter recomputation.
The old roughly 468k/70k gap included duplicate replay and snapshot copying; it
was not all an unavoidable price of tracking. Each mode now has its own gate.
Array path copies still depend on container length, and summing a getter still
traverses the array when invalidated.

### By design: a bulk array edit is one patch per element

Reversing a ten-thousand element array emits ten thousand patches, and every
commit walks that pair. `Coaction reverse 10k array with a commit listener`
gates it, after a correctness check added in 4.0 turned out to be quadratic and
cost 153 ms on that shape — more than the update it was checking.

The blocking regression check uses the transport-free `coaction` entry:

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
