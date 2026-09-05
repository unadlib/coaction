import { scopeDraft } from './draft';
import type { Patches } from './patch';

/**
 * Describe a change by writing it, and get the transition it amounts to.
 *
 * How a transition is produced is Coaction's decision, not its callers'. A
 * middleware that needs patches for a change it can express as a mutation --
 * `@coaction/history` diffing two snapshots, say -- asks for them here rather
 * than reaching for a draft library of its own, so the producer stays one
 * replaceable piece instead of a dependency every consumer repeats.
 */
export const producePatches = <T extends object>(
  base: T,
  write: (draft: T) => void
): { state: T; patches: Patches; inversePatches: Patches } => {
  const { state, patches, inversePatches } = scopeDraft(base, (draft) => {
    write(draft);
  });
  return { state, patches, inversePatches };
};
