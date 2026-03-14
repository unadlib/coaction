import { apply } from 'mutability';
import { type Store, createBinder } from 'coaction';
import { autorun, runInAction } from 'mobx';

const instancesMap = new WeakMap<object, object>();

type StoreWithSubscriptions = Store<object> & {
  _subscriptions?: Set<() => void>;
};

type MobxInternal = {
  toMutableRaw?: (key: object) => object | undefined;
  actMutable?: typeof runInAction;
};

const handleStore = (
  store: StoreWithSubscriptions,
  rawState: object,
  state: object,
  internal: MobxInternal
) => {
  if (internal.toMutableRaw) return;
  internal.toMutableRaw = (key: object) => instancesMap.get(key);
  store._subscriptions = new Set();
  Object.assign(store, {
    subscribe: (listener: () => void) => {
      const unsubscribe = autorun(listener);
      store._subscriptions!.add(unsubscribe);
      return () => {
        unsubscribe();
        store._subscriptions?.delete(unsubscribe);
      };
    }
  });
  const baseDestroy = store.destroy;
  store.destroy = () => {
    store._subscriptions?.forEach((unsubscribe) => unsubscribe());
    store._subscriptions?.clear();
    store._subscriptions = undefined;
    baseDestroy();
  };
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
