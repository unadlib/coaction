import { apply } from 'mutability';
import { type Store, createBinder } from 'coaction';
import { autorun, runInAction } from 'mobx';

const instancesMap = new WeakMap<object, object>();

const handleStore = (api: Store<object>) => {
  if (api.toRaw) return;
  api.toRaw = (key: object) => instancesMap.get(key);
  Object.assign(api, {
    subscribe: autorun
  });
  api.apply = (state = api.getState(), patches) => {
    if (!patches) {
      if (api.isSliceStore) {
        if (typeof state === 'object' && state !== null) {
          runInAction(() => {
            for (const key in state) {
              if (
                typeof state[key as keyof typeof state] === 'object' &&
                state[key as keyof typeof state] !== null
              ) {
                Object.assign(
                  api.getState()[key as keyof typeof state],
                  state[key as keyof typeof state]
                );
              }
            }
          });
        }
      } else {
        runInAction(() => {
          Object.assign(api.getState(), state);
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
