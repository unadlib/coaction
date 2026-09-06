# The checks, and what each one is for

`pnpm check` is the developer and CI gate. `pnpm check:release` is a subset that
verifies the artifact, and is what the publish workflow runs.

| Command                | What it establishes                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:release`   | lint, format, types, build, package quality, size budgets, entry interop, the test suite, and the packed tarballs installing and working |
| `pnpm check`           | the above, plus the mutation testing and the defect replay                                                                               |
| `pnpm soak`            | the property and fuzz suites at many times their everyday size                                                                           |
| `pnpm benchmark:check` | performance floors                                                                                                                       |

## Two checks that check the checks

A passing test suite is evidence only if a failure would have been caught. Two
scripts establish that, and both are outside `check:release` on purpose: they
rewrite source files and read git history, which is development tooling and not
something a publish should depend on.

**`pnpm test:properties`** breaks the sync checkpoint parser twelve ways and
requires the property suite to catch each one. It has caught the properties four
times: a totality check that accepted any `TypeError`, including the native one
from calling `findIndex` on a non-array; a generator whose random keys never
landed on `outbox`; malformed patches that were all missing `value`, so the op
and path checks were never reached; and a "damaged" timestamp of `3`, which is
three milliseconds after the epoch and perfectly valid.

**`pnpm test:fuzz-catches`** rewinds the files that fixed five real defects and
requires the named fuzz suite to go red for each. It has caught a generator
whose `shuffle` unshifted an array where the runtime emits whole-element
replaces, putting an entire class of bug out of reach for want of one token.

### The history dependency

`check-fuzz-catches.mjs` addresses those commits by hash, so they have to stay
reachable. Rewriting the history that contains them breaks the check for
everybody; the failure names the hash it could not find. Recovering means
finding the new hash for the same change and updating the entry, or dropping the
entry if the change no longer exists as one commit.

Do not delete the check to make it pass. What it establishes — that a green fuzz
run means something — is the reason the fuzz suites are worth running at all.

## Size budgets

See [`scripts/SIZE-BUDGETS.md`](../../scripts/SIZE-BUDGETS.md): two numbers per
entry, what moving one requires, and why a ceiling is never raised on its own.

## Benchmarks

See [`scripts/BENCHMARK-GATE.md`](../../scripts/BENCHMARK-GATE.md): the floors,
the one regression the gate found when it was repaired, and the write cost that
reactive tracking brings, which is accepted and gated rather than fixed.
