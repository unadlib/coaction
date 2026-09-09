import { createBinder, type Store } from 'coaction/adapter';
import { createStore, type PrimitiveAtom } from 'jotai/vanilla';

export * from 'jotai/vanilla';

type AtomMap = Record<PropertyKey, PrimitiveAtom<any>>;
type JotaiStore = ReturnType<typeof createStore>;

type InferAtomValues<TAtoms extends AtomMap> = {
  [K in keyof TAtoms]: TAtoms[K] extends PrimitiveAtom<infer TValue>
    ? TValue
    : never;
};

type ActionsFactory<
  TAtoms extends AtomMap,
  TActions extends Record<PropertyKey, (...args: any[]) => any>
> = (helpers: { store: JotaiStore; atoms: TAtoms }) => TActions;

type JotaiContext<
  TAtoms extends AtomMap = AtomMap,
  TActions extends Record<PropertyKey, (...args: any[]) => any> = {}
> = {
  store: JotaiStore;
  atoms: TAtoms;
  atomKeys: (keyof TAtoms & PropertyKey)[];
  actions: TActions;
};

const isUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' &&
  (key === '__proto__' || key === 'prototype' || key === 'constructor');

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const setOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  value: unknown
) => {
  if (isUnsafeKey(key)) {
    return;
  }
  target[key] = value;
};

const assignOwnEnumerable = (
  target: Record<PropertyKey, unknown>,
  source: object
) => {
  for (const key of getOwnEnumerableKeys(source)) {
    if (isUnsafeKey(key)) {
      continue;
    }
    target[key] = (source as Record<PropertyKey, unknown>)[key];
  }
};

const getAtomState = <
  TAtoms extends AtomMap,
  TActions extends Record<PropertyKey, (...args: any[]) => any>
>(
  context: JotaiContext<TAtoms, TActions>
) => {
  const state = {} as InferAtomValues<TAtoms>;
  for (const key of context.atomKeys) {
    setOwnEnumerable(
      state as Record<PropertyKey, unknown>,
      key,
      context.store.get(context.atoms[key])
    );
  }
  return state;
};

/**
 * Bind jotai vanilla store to Coaction.
 */
export const bindJotai = <
  TAtoms extends AtomMap,
  TActions extends Record<PropertyKey, (...args: any[]) => any> = {}
>({
  store,
  atoms,
  actions
}: {
  store: JotaiStore;
  atoms: TAtoms;
  actions?: ActionsFactory<TAtoms, TActions>;
}) => {
  const context: JotaiContext<TAtoms, TActions> = {
    store,
    atoms,
    atomKeys: getOwnEnumerableKeys(atoms).filter(
      (key) => !isUnsafeKey(key)
    ) as (keyof TAtoms & PropertyKey)[],
    actions: (actions?.({
      store,
      atoms
    }) ?? {}) as TActions
  };
  let isCoactionUpdating = false;
  let isJotaiUpdating = false;
  const bindStore = createBinder({
    handleStore: (coactionStore: Store<object>, rawState, state, internal) => {
      const syncAtomsFromState = (nextState: object) => {
        const nextStateRecord = nextState as Record<PropertyKey, unknown>;
        for (const key of context.atomKeys) {
          if (Object.prototype.hasOwnProperty.call(nextStateRecord, key)) {
            context.store.set(context.atoms[key], nextStateRecord[key]);
          }
        }
      };
      const unsubscriptions = context.atomKeys.map((key) =>
        context.store.sub(context.atoms[key], () => {
          if (isCoactionUpdating) {
            return;
          }
          if (coactionStore.share === 'client') {
            isCoactionUpdating = true;
            try {
              syncAtomsFromState(coactionStore.getState());
            } finally {
              isCoactionUpdating = false;
            }
            throw new Error('client jotai store cannot be updated');
          }
          isJotaiUpdating = true;
          try {
            coactionStore.setState(getAtomState(context));
            internal.listeners.forEach((listener) => internal.notify(listener));
          } finally {
            isJotaiUpdating = false;
          }
        })
      );
      const baseDestroy = coactionStore.destroy;
      let destroyed = false;
      coactionStore.destroy = () => {
        if (destroyed) {
          return;
        }
        destroyed = true;
        unsubscriptions.forEach((unsubscribe) => unsubscribe());
        baseDestroy();
      };
      internal.updateImmutable = (nextState: object) => {
        if (isJotaiUpdating) {
          return;
        }
        isCoactionUpdating = true;
        try {
          syncAtomsFromState(nextState);
        } finally {
          isCoactionUpdating = false;
        }
        internal.listeners.forEach((listener) => internal.notify(listener));
      };
    },
    handleState: (() => {
      const stateWithActions = {};
      assignOwnEnumerable(stateWithActions, getAtomState(context));
      assignOwnEnumerable(stateWithActions, context.actions);
      const descriptors = Object.getOwnPropertyDescriptors(stateWithActions);
      const copyState = Object.defineProperties({}, descriptors);
      const rawState = Object.defineProperties({}, descriptors);
      return {
        copyState,
        bind: () => rawState
      };
    }) as any
  });
  return bindStore({} as any) as InferAtomValues<TAtoms> & TActions;
};

/**
 * Adapt a state type for Coaction create function.
 */
export const adapt = <T extends object>(store: T) => store as T;
