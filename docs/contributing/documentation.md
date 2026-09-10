# Maintaining documentation

The website reads `apps/website/content/docs/{en,zh}`. It does not import the
repository's hand-written `docs/` files. Update matching explanations together
when a public contract changes; link to a detailed guide instead of repeating
an incomplete version of that contract.

| Changed contract                | Repository surfaces                                             | Website pages in both languages                          |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Entries and supported versions  | README, `docs/migration/v4.md`, entry migration guides          | Installation, 4.0 migration, performance, support matrix |
| Getters, selectors and tracking | README, `docs/comparison/single-thread.md`                      | Computed, performance, Zustand migration                 |
| Commit hooks and replay         | `packages/core/api-docs.ts`, `docs/reference/`, package READMEs | Core API, Store commits, 4.0 migration                   |
| Benchmark or bundle claims      | README, `docs/benchmarking/`, scripts and fixtures              | Performance, when not to use Coaction                    |

For the generated reference, edit the source JSDoc and the documentation-only
catalog, then run `pnpm docs:api` and commit the output. `pnpm docs:api:check`
regenerates it and rejects uncommitted generated differences. It runs as part
of `pnpm check`, including CI. Freshness does not prove the catalog includes
every new public symbol; review exports from the owning package entry too.

For website changes, run:

```sh
pnpm --filter coaction-website typecheck
pnpm --filter coaction-website build
pnpm website:check
```

The export check verifies language inventories, links, search, canonical URLs
and the sitemap. It does not compare prose semantics. Check examples against
their actual imports, and keep the English and Chinese code blocks aligned.
Use the deployment's `SITE_BASE_PATH` and `SITE_URL` when checking a Pages build.

Performance claims need the measured revision, runtime, dependency versions,
workload and command. Label historical runs. Entry sizes with dependencies
externalized are not application bundle sizes. A cached read, update plus read,
full scan and pure write are different workloads and should stay distinguishable.
