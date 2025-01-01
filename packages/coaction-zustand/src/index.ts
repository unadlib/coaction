import { type Store, createBinder } from 'coaction';
import type { StateCreator, StoreApi } from 'zustand';

type BindZustand = <T>(
  initializer: StateCreator<T, [], []>
) => StateCreator<T, [], []>;

const storeMap = new Map<string, StoreApi<any>>();

/**
 * Bind a store to Zustand
 */
export const bindZustand = ((initializer: StateCreator<any, [], []>) =>
  (set, get, zustandStore) => {
    let coactionStore: Store<object>;
    const internalBindZustand = createBinder<BindZustand>({
      handleStore: (store, rawState, state, internal, key) => {
        coactionStore = store;
        if (key) {
          if (zustandStore.getState() === (internal.rootState as any)[key])
            return;
          (internal.rootState as any)[key] = zustandStore.getState();
          storeMap.set(key, zustandStore);
          let isCoactionUpdated = false;
          zustandStore.subscribe(() => {
            if (!isCoactionUpdated) {
              (internal.rootState as any)[key] =
                zustandStore.getState() as object;
              if (coactionStore.share === 'client') {
                throw new Error('client zustand store cannot be updated');
              } else if (coactionStore.share === 'main') {
                // emit to all clients
                coactionStore.setState({
                  [key]: zustandStore.getState()
                });
              }
            }
            internal.listeners.forEach((listener) => listener());
          });
          if (internal.updateImmutable) return;
          internal.updateImmutable = (state: any) => {
            isCoactionUpdated = true;
            try {
              for (const _key of Object.keys(state)) {
                const zustandStore = storeMap.get(_key)!;
                zustandStore.setState(state[_key], true);
              }
            } finally {
              isCoactionUpdated = false;
            }
          };
          return;
        }
        if (zustandStore.getState() === internal.rootState) return;
        let isCoactionUpdated = false;
        internal.rootState = zustandStore.getState() as object;
        // TODO: check Slice Zustand store
        zustandStore.subscribe(() => {
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
