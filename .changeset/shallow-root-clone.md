---
'coaction': patch
---

Fix an O(total state) cost in the object-payload `setState()` path. Copying the store's current
root state ran every value through the deep replacement sanitizer, so `set({ ... })` re-cloned
untouched fields on every commit. Replacing a single scalar in a store holding a 10,000-item array
drops from ~1,591 ms to ~2 ms per 400 operations. Incoming payloads are still deep-sanitized, so
the aliasing and unsafe-key guarantees are unchanged. Both the fixed path and the payload path are
now covered by benchmark regression thresholds. The `coaction/local` gzip budget moves up ~240 B to cover the new helper.
