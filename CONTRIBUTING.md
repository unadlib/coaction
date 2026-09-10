# Contributing

Thanks for helping improve Coaction. This guide is the short path for opening a
useful issue or pull request.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- For adapter work, read the [adapter contract](./docs/architecture/adapter-contract.md)
  and [adapter guide](./docs/contributing/adapter-guide.md).
- For support boundaries, check the [support matrix](./docs/architecture/support-matrix.md).

## Development Setup

Coaction uses pnpm workspaces.

```sh
corepack enable
pnpm install
```

The repository requires Node.js 22.14.0 or newer. CI currently exercises Node.js
22 and 24 for the main workflow.

## Common Commands

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:e2e:browser
pnpm test:coverage
```

Use `pnpm check` before larger pull requests. It runs quality checks, type
checking, builds, tests, and generated API freshness checks.

## Documentation Changes

README, repository `docs/`, and website English/Chinese MDX are maintained
separately. Public behavior changes should update every affected surface in the
same change. Follow the [documentation map](./docs/contributing/documentation.md)
to find the related pages and validation commands.

## Pull Requests

- Keep changes focused and prefer one behavior change per pull request.
- Add or update tests for changed runtime behavior.
- Update package README files when public API or compatibility behavior changes.
- Update the support matrix when an official guarantee expands or narrows.
- Add a changeset for user-facing package changes.

PR CI is intentionally gated. A maintainer adds the `run-ci` label when a pull
request is ready for CI. After the label is present, later pushes to the same PR
continue to run the PR workflow.

## Adapter Changes

Official adapters should keep their contract explicit:

- binder-backed adapters bind a whole store, not a slice
- client mode must not invent a second write authority
- package-specific quirks belong in package tests and docs
- shared guarantees must be represented by contract tests

See [docs/contributing/adapter-guide.md](./docs/contributing/adapter-guide.md)
for the detailed adapter checklist.
