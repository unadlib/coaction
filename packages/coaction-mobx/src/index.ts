import { apply } from 'mutability';
import { type Store, createBinder } from 'coaction';
import { autorun, runInAction } from 'mobx';

const instancesMap = new Map<object, any>();

const handleStore = (api: Store<object>) => {
  if (api.toRaw) return;
  api.toRaw = (key: any) => instancesMap.get(key);
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

export const bindMobx = createBinder({
  handleStore,
  handleState: (options: any) => {
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const copyState = Object.defineProperties({}, descriptors);
    const rawState = Object.defineProperties({}, descriptors);
    return {
      copyState,
      bind: (state: any) => {
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }
});
