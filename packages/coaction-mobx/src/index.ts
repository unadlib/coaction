import { apply } from 'mutability';
import { type Store, createBinder } from 'coaction';
import { autorun, runInAction } from 'mobx';

const instancesMap = new WeakMap<object, object>();

type MobxInternal = {
  toMutableRaw?: (key: object) => object | undefined;
  actMutable?: typeof runInAction;
};

const handleStore = (
  store: Store<object>,
  rawState: object,
  state: object,
  internal: MobxInternal
) => {
  if (internal.toMutableRaw) return;
  internal.toMutableRaw = (key: object) => instancesMap.get(key);
  Object.assign(store, {
    subscribe: autorun
  });
  internal.actMutable = runInAction;
  store.apply = (state = store.getState(), patches) => {
    if (!patches) {
      runInAction(() => {
        Object.assign(store.getState(), state);
      });
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
