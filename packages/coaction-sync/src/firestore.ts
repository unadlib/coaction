import type { SyncAdapter, SyncPullResult } from './index';
import { createCrudSyncAdapter } from './crud';

type Patches = SyncPullResult['patches'];

export type FirestoreDocument = {
  id: string;
  data(): Record<string, unknown> | undefined;
};

export type FirestoreSnapshot = {
  docs: readonly FirestoreDocument[];
};

export type FirestoreChange = {
  type: 'added' | 'modified' | 'removed';
  doc: FirestoreDocument;
};

export type FirestoreChangeSnapshot = {
  docChanges(): readonly FirestoreChange[];
};

/**
 * The `firebase/firestore` functions this adapter calls.
 *
 * Firestore's modular API is tree-shakable functions rather than methods, so
 * they are passed in instead of imported. That also keeps `firebase` out of
 * this package's dependencies:
 *
 * ```ts
 * import { getDocs, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
 *
 * createFirestoreSyncAdapter({
 *   firestore: { getDocs, doc, setDoc, deleteDoc, onSnapshot },
 *   collection: collection(db, 'todos'),
 *   path: ['todos']
 * });
 * ```
 */
export type FirestoreOperations = {
  getDocs(reference: unknown): Promise<FirestoreSnapshot>;
  doc(collection: unknown, id: string): unknown;
  setDoc(reference: unknown, data: unknown): Promise<unknown>;
  deleteDoc(reference: unknown): Promise<unknown>;
  onSnapshot?(
    reference: unknown,
    next: (snapshot: FirestoreChangeSnapshot) => void,
    error?: (error: unknown) => void
  ): () => void;
};

export type FirestoreSyncAdapterOptions = {
  firestore: FirestoreOperations;
  /**
   * The `CollectionReference` documents are written to. `doc(collection, id)`
   * has to be able to name a child of it, which a `Query` cannot.
   */
  collection: unknown;
  /**
   * What to read, when that is narrower than the whole collection -- a `Query`
   * built from it, typically. Reads fall back to `collection`.
   *
   * A narrowed read is not the whole collection, so it cannot be treated as
   * authoritative: rows outside the query are missing from it, not deleted.
   */
  query?: unknown;
  /** Where the keyed collection lives in the store, e.g. `['todos']`. */
  path: readonly PropertyKey[];
  /**
   * Field carrying the document id in the store's record. Defaults to `id`.
   * Firestore keeps the id on the document rather than in its data, so it is
   * merged in on read and stripped again on write.
   */
  idField?: string;
  /** Apply `onSnapshot` changes as they arrive. */
  realtime?: boolean;
  /** Report a realtime listener failure. */
  onError?: (error: unknown) => void;
};

/**
 * Sync a keyed collection with a Firestore collection.
 *
 * Built on {@link createCrudSyncAdapter}. What it adds beyond the CRUD calls is
 * the part that is easy to get wrong: a Firestore document does not contain its
 * own id, so the id is merged into the record on the way in and removed again
 * on the way out, and a `docChanges()` batch becomes one patch per change.
 */
export const createFirestoreSyncAdapter = <TRecord extends object>({
  firestore,
  collection,
  query,
  path,
  idField = 'id',
  realtime = false,
  onError
}: FirestoreSyncAdapterOptions): SyncAdapter => {
  const toRecord = (document: FirestoreDocument) =>
    ({ ...(document.data() ?? {}), [idField]: document.id }) as TRecord;

  const getId = (record: TRecord) =>
    String((record as Record<string, unknown>)[idField]);

  /** Firestore stores the id as the document key, never inside the document. */
  const toDocumentData = (record: TRecord) => {
    const { [idField]: _id, ...data } = record as Record<string, unknown>;
    return data;
  };

  const crud = createCrudSyncAdapter<TRecord>({
    path,
    getId,
    // A full read of the collection is the whole truth. A narrowed one is not:
    // a document the query excludes is absent, not gone.
    authoritativeList: query === undefined,
    list: async () => {
      const snapshot = await firestore.getDocs(query ?? collection);
      return { records: snapshot.docs.map(toRecord) };
    },
    // Firestore's setDoc writes the whole document either way, so a create and
    // an update are the same call.
    create: async (record) => {
      await firestore.setDoc(
        firestore.doc(collection, getId(record)),
        toDocumentData(record)
      );
      return record;
    },
    update: async (record) => {
      await firestore.setDoc(
        firestore.doc(collection, getId(record)),
        toDocumentData(record)
      );
      return record;
    },
    delete: async (_record, id) => {
      await firestore.deleteDoc(firestore.doc(collection, id));
    }
  });

  if (!realtime) {
    return crud;
  }

  return {
    ...crud,
    subscribe(listener) {
      if (!firestore.onSnapshot) {
        throw new Error(
          'createFirestoreSyncAdapter({ realtime: true }) needs onSnapshot in `firestore`.'
        );
      }
      return firestore.onSnapshot(
        query ?? collection,
        (snapshot) => {
          const patches: NonNullable<Patches> = [];
          for (const change of snapshot.docChanges()) {
            if (change.type === 'removed') {
              patches.push({
                op: 'remove',
                path: [...path, change.doc.id]
              } as NonNullable<Patches>[number]);
              continue;
            }
            patches.push({
              op: 'replace',
              path: [...path, change.doc.id],
              value: toRecord(change.doc)
            } as NonNullable<Patches>[number]);
          }
          if (patches.length) listener({ patches });
        },
        onError
      );
    }
  };
};
