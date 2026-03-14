import { type Store, createBinder } from 'coaction';
import type { StateCreator, StoreApi } from 'zustand';

type BindZustand = <T>(
  initializer: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

type StoreWithDestroyers = Store<object> & {
  _destroyers?: Set<() => void>;
};

/**
 * Bind a store to Zustand
 */
export const bindZustand = ((initializer: StateCreator<any, [], []>) =>
  (set, get, zustandStore) => {
    let coactionStore: StoreWithDestroyers;
    const internalBindZustand = createBinder<BindZustand>({
      handleStore: (store, rawState, state, internal) => {
        coactionStore = store as StoreWithDestroyers;
        if (!coactionStore._destroyers) {
          coactionStore._destroyers = new Set();
          const baseDestroy = coactionStore.destroy;
          coactionStore.destroy = () => {
            coactionStore._destroyers?.forEach((destroy) => destroy());
            coactionStore._destroyers?.clear();
            coactionStore._destroyers = undefined;
            baseDestroy();
          };
        }
        if (zustandStore.getState() === internal.rootState) return;
        let isCoactionUpdated = false;
        internal.rootState = zustandStore.getState() as object;
        const unsubscribe = zustandStore.subscribe(() => {
          if (!isCoactionUpdated) {
            internal.rootState = zustandStore.getState() as object;
            if (coactionStore.share === 'client') {
              throw new Error('client zustand store cannot be updated');
            } else if (coactionStore.share === 'main') {
              // emit to all clients
              coactionStore.setState(zustandStore.getState()!);
            }
          }
          internal.listeners.forEach((listener) => listener());
        });
        coactionStore._destroyers.add(() => {
          unsubscribe();
        });
        internal.updateImmutable = (state: any) => {
          isCoactionUpdated = true;
          try {
            zustandStore.setState(state, true);
          } finally {
            isCoactionUpdated = false;
          }
        };
      },
      handleState: (externalState) => {
        return {
          copyState: externalState,
          bind: (state) => state
        };
      }
    });
    const state = initializer(
      (state) => {
        coactionStore.setState(state);
      },
      () => coactionStore.getState(),
      zustandStore
    );
    return internalBindZustand(state);
  }) as BindZustand;

/**
 * Adapt a store type to Pinia
 */
export const adapt = <T extends object>(store: StoreApi<T>) =>
  store as unknown as T;
