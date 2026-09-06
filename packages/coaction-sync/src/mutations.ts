import { normalizePatchPath } from './paths';
import { sanitizeReplacementState } from 'coaction/adapter';
import type { Patches, SyncMutation } from './types';

let mutationSequence = 0;

export const createMutationId = () =>
  `${Date.now().toString(36)}-${(++mutationSequence).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

export const clonePatches = (patches: Patches) =>
  sanitizeReplacementState(patches) as Patches;

/**
 * Name the write in a rejection. The check runs on the patch value, so on its
 * own it can only say the value was wrong at its own root -- which for
 * `this.updatedAt = new Date()` is no help at all in a state of any size.
 */
export const describeWrite = (patch: Patches[number]) => {
  const path = normalizePatchPath(patch.path);
  return path.length
    ? `the write at ${path.map(String).join('.')}`
    : 'this write';
};

/**
 * A mutation to hand to somebody outside.
 *
 * The outbox is what this client owes the remote, and the rebase reads it back
 * as its own working set. Handing out the live objects made every reader a
 * writer: `getPending().splice(0)` emptied the queue, and an adapter that
 * normalised the patches it was given rewrote what would be replayed after the
 * next pull -- a lost write with no error anywhere. The `readonly` on the type
 * says so, but only to callers written in TypeScript who are looking.
 *
 * The cost is one deep copy of the patches at each boundary crossing, which is
 * where they are about to be serialised or read anyway.
 */
export const cloneMutation = (mutation: SyncMutation): SyncMutation => ({
  id: mutation.id,
  patches: clonePatches(mutation.patches),
  inversePatches: clonePatches(mutation.inversePatches),
  createdAt: mutation.createdAt
});

export const mergeMutationsById = (...groups: readonly SyncMutation[][]) => {
  const order: string[] = [];
  const byId = new Map<string, SyncMutation>();
  for (const group of groups) {
    for (const mutation of group) {
      if (!byId.has(mutation.id)) order.push(mutation.id);
      byId.set(mutation.id, mutation);
    }
  }
  return order.map((id) => byId.get(id)!);
};

export const pathsOverlap = (left: unknown, right: unknown) => {
  const a = normalizePatchPath(left);
  const b = normalizePatchPath(right);
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index += 1) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
};

export const getOverlappingRemotePatches = (
  mutation: SyncMutation,
  remotePatches: Patches
) =>
  remotePatches.filter((remotePatch) =>
    mutation.patches.some((localPatch) =>
      pathsOverlap(localPatch.path, remotePatch.path)
    )
  ) as Patches;
