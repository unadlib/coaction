import { apply } from 'mutability';
import { create, type Store } from 'coaction';
import { createPinia, setActivePinia, defineStore as createStore } from 'pinia';

const instancesMap = new Map<object, any>();
// TODO: fix async actions
// TODO: fix set function
export const defineStore = (name: string, options: any) => {
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
      name,
      ...options.state(),
      ...options.actions
    },
    descriptors
  );
  const store = createStore(name, options)();
  instancesMap.set(rawState, store);
  return rawState;
};

type StoreWithSubscriptions = Store<object> & {
  // TODO: fix type
  _subscriptions?: Set<(...args: any) => void>;
  _destroyers?: Set<() => void>;
};

// TODO: fix defineStore same name
const handleStore = (
  api: StoreWithSubscriptions,
  createMobxState: () => any
) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const state = createMobxState();
  if (!api.getMutableInstance) {
    api.getMutableInstance = (key: any) => instancesMap.get(key);
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
      if (!patches) {
        if (api.isSlices) {
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
  const stopWatch = api
    .getMutableInstance(state)
    .$subscribe((...args: any[]) => {
      api._subscriptions!.forEach((callback) => callback(...args));
    });
  const destroy = () => {
    instancesMap.delete(state);
    stopWatch();
  };
  api._destroyers!.add(destroy);
  if (process.env.NODE_ENV === 'development') {
    // TODO: check with observe for unexpected changes
  }
  return state;
};

export const createWithPinia = (
  createPiniaState: () => any | Record<string, () => any>,
  options?: any
) => {
  if (typeof createPiniaState === 'function') {
    return create((set: any, get: any, api: any) => {
      return handleStore(api, createPiniaState.bind(null, set, get, api));
    }, options);
  }
  if (typeof createPiniaState === 'object' && createPiniaState !== null) {
    return create(
      Object.keys(createPiniaState).reduce((acc, key) => {
        acc[key] = (set: any, get: any, api: any) =>
          handleStore(api, createPiniaState[key].bind(null, set, get, api));
        return acc;
      }, {} as any),
      options
    );
  }
  throw new Error('createPiniaState must be a function or an object');
};
