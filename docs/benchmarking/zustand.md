# Zustand-Focused Benchmarks

This document records the benchmark scenarios used when positioning Coaction
against Zustand. The numbers should be regenerated locally before publishing a
claim, because JavaScript microbenchmarks vary by runtime, CPU, package version,
and state shape.

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

It is useful for explaining why Coaction can keep mutable update DX without
following Zustand's Immer performance profile.

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

The maintained Zustand field is included intentionally. It is the fastest way to
read a derived value in Zustand, but it shifts consistency work into actions.
Coaction's value proposition is that cached derived state is part of the store
runtime instead of a field that application code must keep synchronized.

## How to Interpret Results

Do not publish one benchmark as a universal statement that one library is always
faster.

Use the update benchmark for this claim:

> Coaction's built-in mutable update path can avoid the cost profile of
> Zustand + Immer in large immutable updates.

Use the derived-state benchmark for this claim:

> Coaction has a built-in cached derived-state runtime. Zustand can match
> constant-time reads by manually storing derived values, but the application
> must maintain those values consistently.

## Future Benchmark Candidates

The next useful comparisons are:

- React rerender count for unrelated updates
- selector-heavy component trees
- bundle size for minimal stores and feature-rich stores
- worker/shared-mode round trip latency
- adapter write propagation for `@coaction/zustand`

Keep benchmark scripts small and source-controlled. Generated images should only
be committed when the README or documentation references their exact numbers.
