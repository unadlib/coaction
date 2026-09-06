import type { Patches, SyncMutation } from './types';

/**
 * The checkpoint layout this build writes.
 *
 * The durable contract is not one field any more -- an outbox, an adapter
 * baseline, a cursor, a revision, an optimistic snapshot and a pre-hydration
 * journal, which have to be read back as one consistent set. Changing the shape
 * of any of them is a thing that will happen, and a reader with no version to
 * check has to guess from the content of the data whether it understands it.
 *
 * A checkpoint written before this existed has no `formatVersion` and is
 * version 1: that is what every one of them is. A checkpoint from a *newer*
 * build is refused rather than reinterpreted, and left where it is -- the
 * mutations in it are writes the user made, and this build guessing at them is
 * worse than telling the application it cannot read them.
 */
export const CHECKPOINT_FORMAT_VERSION = 1;

export const isPatchShape = (value: unknown) => {
  if (typeof value !== 'object' || value === null) return false;
  const { op, path } = value as { op?: unknown; path?: unknown };
  if (op !== 'add' && op !== 'replace' && op !== 'remove') return false;
  if (Array.isArray(path)) {
    if (
      !path.every((key) => typeof key === 'string' || typeof key === 'number')
    ) {
      return false;
    }
  } else if (typeof path !== 'string') {
    return false;
  }
  return op === 'remove' || 'value' in (value as object);
};

export const isMutationShape = (value: unknown): value is SyncMutation => {
  if (typeof value !== 'object' || value === null) return false;
  const { id, createdAt, patches, inversePatches } = value as SyncMutation;
  return (
    typeof id === 'string' &&
    id !== '' &&
    Number.isFinite(createdAt) &&
    Array.isArray(patches) &&
    patches.every(isPatchShape) &&
    Array.isArray(inversePatches) &&
    inversePatches.every(isPatchShape)
  );
};

export const reject = (what: string, problem: string): never => {
  throw new TypeError(`${what} ${problem}.`);
};

/**
 * Read an outbox off storage, which is untrusted input.
 *
 * Refused whole rather than filtered: the mutations are a sequence of deltas,
 * so replaying the survivors of a bad one rebuilds a different state than the
 * user left, without saying so.
 */
export const readOutbox = (value: unknown, what: string): SyncMutation[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) reject(what, 'has an outbox that is not an array');
  const index = (value as unknown[]).findIndex(
    (mutation) => !isMutationShape(mutation)
  );
  if (index !== -1) {
    reject(what, `has a malformed mutation at index ${index} of its outbox`);
  }
  const outbox = value as SyncMutation[];
  // Ids are the idempotency key the remote is asked to honour and what an
  // acknowledgement names. Two mutations sharing one are not a queue this can
  // drain: acking either drops both.
  if (new Set(outbox.map(({ id }) => id)).size !== outbox.length) {
    reject(what, 'has two mutations sharing an id in its outbox');
  }
  return outbox;
};

export const readCheckpointBody = (raw: string, what: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return reject(what, 'is not JSON');
  }
  // An array is an object as far as `typeof` is concerned, and reading fields
  // off one finds nothing -- so junk under this key used to be indistinguishable
  // from a first run with nothing stored yet, and started clean.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    reject(what, 'is not an object');
  }
  const body = parsed as Record<string, unknown>;
  const version = body.formatVersion;
  if (version !== undefined) {
    if (
      typeof version !== 'number' ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      reject(what, 'has an unreadable formatVersion');
    }
    if ((version as number) > CHECKPOINT_FORMAT_VERSION) {
      reject(
        what,
        `was written in format ${version}, and this build reads ${CHECKPOINT_FORMAT_VERSION}. It has been left as it is`
      );
    }
  }
  return body;
};

export const parseJournal = (raw: string | null, what = 'The sync journal') => {
  if (!raw) return [] as SyncMutation[];
  // The journal was written as a bare array before it carried a version.
  if (raw.startsWith('[')) return readOutbox(JSON.parse(raw), what);
  return readOutbox(readCheckpointBody(raw, what).outbox, what);
};
