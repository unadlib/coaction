import { type Store, createBinder } from 'coaction';
import type { StateCreator, StoreApi } from 'zustand';

type BindZustand = <T>(
  initializer: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

/**
 * Bind a store to Zustand
 */
export const bindZustand = ((initializer: StateCreator<any, [], []>) =>
  (set, get, zustandStore) => {
    let coactionStore: Store<object>;
    const internalBindZustand = createBinder<BindZustand>({
      handleStore: (store, rawState, state, internal) => {
        if (zustandStore.getState() === internal.rootState) return;
        internal.rootState = zustandStore.getState() as object;
        coactionStore = store;
        zustandStore.subscribe(() => {
          internal.listeners.forEach((listener) => listener());
        });
        internal.updateImmutable = (state: any) => {
          zustandStore.setState(state, true);
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
