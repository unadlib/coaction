# @coaction/svelte Example

A Coaction integration tool for Svelte

This example exports a single `runExample()` function from `index.ts`.
The e2e suite executes it and verifies the behavior in `examples/e2e/test/subpackages.e2e.test.ts`.

## Files

- `index.ts`: minimal happy-path usage for @coaction/svelte

## Validate

Run all subpackage examples:

```bash
pnpm test:e2e
```
