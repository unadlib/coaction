import { type Store, createBinder } from 'coaction';

interface BindZustand {
  <T>(target: T): T;
}

/**
 * Bind a store to Zustand
 */
export const bindZustand =
  (initializer: any) => (set: any, get: any, zustandStore: any) => {
    let coactionStore: Store<object>;
    const internalBindZustand = createBinder<BindZustand>({
      handleStore: (
        store: Store<object>,
        rawState: object,
        state: object,
        internal: any
      ) => {
        if (zustandStore.getState() === internal.rootState) return;
        internal.rootState = zustandStore.getState();
        coactionStore = store;
        zustandStore.subscribe(() => {
          internal.listeners.forEach((listener: any) => listener());
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
      (state: any) => {
        coactionStore.setState(state);
      },
      () => coactionStore.getState(),
      zustandStore
    );
    return internalBindZustand(state);
  };
