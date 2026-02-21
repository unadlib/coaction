# coaction Example

A sleek JavaScript library designed for high-performance and multithreading web apps.

This example exports a single `runExample()` function from `index.ts`.
The e2e suite executes it and verifies the behavior in `examples/e2e/test/subpackages.e2e.test.ts`.

## Files

- `index.ts`: minimal happy-path usage for coaction

## Validate

Run all subpackage examples:

```bash
pnpm test:e2e
```
