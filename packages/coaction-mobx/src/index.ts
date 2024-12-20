import { apply } from 'mutability';
import { type Store, createBinder } from 'coaction';
import { autorun, runInAction } from 'mobx';

const instancesMap = new WeakMap<object, object>();

const handleStore = (
  store: Store<object>,
  rawState: object,
  state: object,
  internal: any
) => {
  if (internal.toRaw) return;
  internal.toRaw = (key: object) => instancesMap.get(key);
  Object.assign(store, {
    subscribe: autorun
  });
  store.act = runInAction;
  store.apply = (state = store.getState(), patches) => {
    if (!patches) {
      if (store.isSliceStore) {
        if (typeof state === 'object' && state !== null) {
          runInAction(() => {
            for (const key in state) {
              const _key = key as keyof typeof state;
              const _state = state[_key];
              if (typeof _state === 'object' && _state !== null) {
                Object.assign(store.getState()[_key], _state);
              }
            }
          });
        }
      } else {
        runInAction(() => {
          Object.assign(store.getState(), state);
        });
      }
      return;
    }
    runInAction(() => {
      apply(state, patches!);
    });
  };
};

interface BindMobx {
  <T>(target: T): T;
}

/**
 * Bind a store to Mobx
 */
export const bindMobx = createBinder<BindMobx>({
  handleStore,
  handleState: (options) => {
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const copyState = Object.defineProperties(
      {},
      descriptors
    ) as typeof options;
    const rawState = Object.defineProperties({}, descriptors) as typeof options;
    return {
      copyState,
      bind: (state) => {
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }
});
