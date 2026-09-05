---
'coaction': major
'@coaction/react': major
---

`coaction` is now the local runtime, and `coaction/local` is gone. Shared and
client stores import `create` from `coaction/shared`.

The default import decided what a bundle carried, and it decided wrong for
almost everyone: `coaction` reached the transport runtime, so `data-transport`
— 27 KB minified — landed in every application that wrote
`import { create } from 'coaction'`, whether or not a Worker was ever involved.
A React application measured 30.1 KB gzip that way and 18.2 KB through
`coaction/local`: the same program, 40% smaller, chosen by a line the docs
barely mentioned.

`coaction/shared` is unchanged — it was already the full build, byte for byte
identical to the root entry — so code that creates shared stores changes one
import and nothing else. `coaction/local` becomes `coaction`.

`@coaction/react/local` is removed for the same reason: it was an explicit alias
of a default that is now unambiguously the local runtime.
`@coaction/react/shared` is unchanged.

Passing `worker`, `transport`, `clientTransport`, `transportPolicy` or `share`
to the default entry throws with the entry to switch to. See
`docs/migration/default-entry-is-local.md`.
