import { createBinder, type Store } from 'coaction';
import type { PrimitiveAtom, Store as JotaiStore } from 'jotai/vanilla';

export * from 'jotai/vanilla';

type AtomMap = Record<string, PrimitiveAtom<any>>;

type InferAtomValues<TAtoms extends AtomMap> = {
  [K in keyof TAtoms]: TAtoms[K] extends PrimitiveAtom<infer TValue>
    ? TValue
    : never;
};

type ActionsFactory<
  TAtoms extends AtomMap,
  TActions extends Record<string, (...args: any[]) => any>
> = (helpers: { store: JotaiStore; atoms: TAtoms }) => TActions;

type JotaiContext<
  TAtoms extends AtomMap = AtomMap,
  TActions extends Record<string, (...args: any[]) => any> = {}
> = {
  store: JotaiStore;
  atoms: TAtoms;
  atomKeys: (keyof TAtoms)[];
  actions: TActions;
};

const getAtomState = <
  TAtoms extends AtomMap,
  TActions extends Record<string, (...args: any[]) => any>
>(
  context: JotaiContext<TAtoms, TActions>
) =>
  context.atomKeys.reduce(
    (state, key) =>
      Object.assign(state, {
        [key]: context.store.get(context.atoms[key])
      }),
    {} as InferAtomValues<TAtoms>
  );

/**
 * Bind jotai vanilla store to Coaction.
 */
export const bindJotai = <
  TAtoms extends AtomMap,
  TActions extends Record<string, (...args: any[]) => any> = {}
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
    atomKeys: Object.keys(atoms),
    actions: (actions?.({
      store,
      atoms
    }) ?? {}) as TActions
  };
  let isCoactionUpdating = false;
  let isJotaiUpdating = false;
  const bindStore = createBinder({
    handleStore: (coactionStore: Store<object>, rawState, state, internal) => {
      const unsubscriptions = context.atomKeys.map((key) =>
        context.store.sub(context.atoms[key], () => {
          if (isCoactionUpdating) {
            return;
          }
          isJotaiUpdating = true;
          try {
            coactionStore.setState(getAtomState(context));
          } finally {
            isJotaiUpdating = false;
          }
        })
      );
      const baseDestroy = coactionStore.destroy;
      coactionStore.destroy = () => {
        unsubscriptions.forEach((unsubscribe) => unsubscribe());
        baseDestroy();
      };
      internal.updateImmutable = (nextState: Record<string, unknown>) => {
        if (isJotaiUpdating) {
          return;
        }
        isCoactionUpdating = true;
        try {
          for (const key of context.atomKeys) {
            if (Object.prototype.hasOwnProperty.call(nextState, key)) {
              context.store.set(context.atoms[key], nextState[key]);
            }
          }
        } finally {
          isCoactionUpdating = false;
        }
      };
    },
    handleState: () => {
      const stateWithActions = Object.assign(
        {},
        getAtomState(context),
        context.actions
      );
      const descriptors = Object.getOwnPropertyDescriptors(stateWithActions);
      const copyState = Object.defineProperties({}, descriptors);
      const rawState = Object.defineProperties({}, descriptors);
      return {
        copyState,
        bind: () => rawState
      };
    }
  });
  return bindStore({} as any) as InferAtomValues<TAtoms> & TActions;
};

/**
 * Adapt a state type for Coaction create function.
 */
export const adapt = <T extends object>(store: T) => store as T;
