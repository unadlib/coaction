import { apply } from 'mutability';
import { createBinder, type Store } from 'coaction';
import { createPinia, setActivePinia } from 'pinia';
import type { _GettersTree, DefineStoreOptions, StateTree } from 'pinia';

const instancesMap = new WeakMap<object, any>();

type StoreWithSubscriptions = Store<object> & {
  // TODO: fix type
  _subscriptions?: Set<(...args: any) => void>;
  _destroyers?: Set<() => void>;
};

// TODO: fix defineStore same name
const handleStore = (api: StoreWithSubscriptions, state: any) => {
  if (!api.toRaw) {
    api.toRaw = (key: any) => instancesMap.get(key);
    Object.assign(api, {
      subscribe: (callback: any) => {
        api._subscriptions!.add(callback);
        return () => api._subscriptions!.delete(callback);
      }
    });
    api._subscriptions = new Set<() => void>();
    api._destroyers = new Set<() => void>();
    const oldDestroy = api.destroy;
    api.destroy = () => {
      oldDestroy();
      api._subscriptions!.clear();
      api._subscriptions = undefined;
      api._destroyers!.forEach((destroy) => destroy());
      api._destroyers = undefined;
    };
    api.apply = (state = api.getState(), patches) => {
      console.log('apply', state, patches);
      if (!patches) {
        if (api.isSliceStore) {
          if (typeof state === 'object' && state !== null) {
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
          }
        } else {
          Object.assign(api.getState(), state);
        }
        return;
      }
      apply(state, patches);
    };
  }
  const stopWatch = api.toRaw(state).$subscribe((...args: any[]) => {
    api._subscriptions!.forEach((callback) => callback(...args));
  });
  const destroy = () => {
    instancesMap.delete(state);
    stopWatch();
  };
  api._destroyers!.add(destroy);
};

export const bindPinia = createBinder({
  handleStore,
  handleState: ((options: DefineStoreOptions<any, any, any, any>) => {
    const descriptors: Record<string, PropertyDescriptor> = {};
    options.getters = options.getters ?? {};
    for (const key in options.getters) {
      descriptors[key] = {
        get() {
          return options.getters[key].call(this, this);
        }
      };
    }
    const rawState = Object.defineProperties(
      {
        ...options.state?.(),
        ...options.actions
      },
      descriptors
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    return {
      copyState: options as any,
      key: 'actions',
      bind: (state: any) => {
        rawState.name = state.$id;
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }) as any
}) as <
  Id extends string,
  S extends StateTree = {},
  G extends _GettersTree<S> = {},
  A = {}
>(
  options: Omit<DefineStoreOptions<Id, S, G, A>, 'id'>
) => Omit<DefineStoreOptions<Id, S, G, A>, 'id'>;
