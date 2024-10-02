import { mutate, apply } from 'mutability';
import { create, type Store } from 'coaction';
import { createPinia, setActivePinia } from 'pinia';

// TODO: fix defineStore same name
const handleStore = (
  api: Store<object>,
  createMobxState: () => any,
  stateKey?: string
) => {
  console.log('api', api);
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = createMobxState()();
  Object.assign(api, {
    // TODO: fix destroy
    subscribe: store.$subscribe
  });
  if (api.share === 'client') {
    api.apply = (state, patches) => {
      apply(state, patches);
    };
    api.setState = (next) => {
      if (api.isSlices) {
        if (typeof next === 'object' && next !== null) {
          for (const key in next) {
            // @ts-ignore
            if (typeof next[key] === 'object' && next[key] !== null) {
              // @ts-ignore
              Object.assign(api.getState()[key], next[key]);
            }
          }
        }
      } else {
        Object.assign(api.getState(), next);
      }
    };
  }
  if (!api.share) {
    return store;
  }
  if (process.env.NODE_ENV === 'development') {
    // TODO: check with observe for unexpected changes
  }
  const actionKeys = Object.keys(store._hmrPayload.actions);
  actionKeys.forEach((key) => {
    const fn = store._hmrPayload.actions[key];
    store[key] = async (...args: any) => {
      if (api.share === 'client') {
        return api.transport?.emit(
          'execute',
          stateKey ? [stateKey, key] : [key],
          args
        );
      }
      let result: any;
      const { patches, inversePatches } = mutate(store, (draft: any) => {
        // TODO: support async actions
        result = fn.apply(draft, args);
      });
      if (stateKey) {
        patches.forEach((patch) => {
          patch.path = [stateKey, ...patch.path];
        });
        inversePatches.forEach((patch) => {
          patch.path = [stateKey, ...patch.path];
        });
      }
      api.setState(null, () => [store, patches, inversePatches]);
      return result;
    };
  });
  return store;
};

export const createWithPinia = (
  createPiniaState: () => any | Record<string, () => any>,
  options?: any
) => {
  if (typeof createPiniaState === 'function') {
    return create((get, set, api) => {
      return handleStore(api, createPiniaState);
    }, options);
  }
  if (typeof createPiniaState === 'object' && createPiniaState !== null) {
    return create(
      Object.keys(createPiniaState).reduce((acc, key) => {
        acc[key] = (get: any, set: any, api: any) =>
          handleStore(api, createPiniaState[key], key);
        return acc;
      }, {} as any),
      options
    );
  }
  throw new Error('createWithPinia must be a function or an object');
};
