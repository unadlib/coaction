import { mutate, apply } from 'mutability';
import { create, type Store } from 'coaction';
import { autorun, runInAction } from 'mobx';

const handleStore = (
  api: Store<object>,
  createMobxState: () => any,
  stateKey?: string
) => {
  Object.assign(api, {
    subscribe: autorun
  });
  if (api.share === 'client') {
    api.apply = (state, patches) => {
      runInAction(() => {
        apply(state, patches);
      });
    };
    api.setState = (next) => {
      if (api.isSlices) {
        if (typeof next === 'object' && next !== null) {
          runInAction(() => {
            for (const key in next) {
              // @ts-ignore
              if (typeof next[key] === 'object' && next[key] !== null) {
                // @ts-ignore
                Object.assign(api.getState()[key], next[key]);
              }
            }
          });
        }
      } else {
        runInAction(() => {
          Object.assign(api.getState(), next);
        });
      }
    };
  }
  const mobxState = createMobxState();
  if (!api.share) {
    return mobxState;
  }
  if (process.env.NODE_ENV === 'development') {
    // TODO: check with observe for unexpected changes
  }
  return new Proxy(mobxState, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      if (typeof value === 'function') {
        return (...args: any) => {
          if (api.share === 'client') {
            return api.transport?.emit(
              'execute',
              stateKey ? [stateKey, key] : [key],
              args
            );
          }
          let result: any;
          const { patches, inversePatches } = mutate(target, (draft: any) => {
            result = value.apply(draft, args);
          });
          if (stateKey) {
            patches.forEach((patch) => {
              patch.path = [stateKey, ...patch.path];
            });
            inversePatches.forEach((patch) => {
              patch.path = [stateKey, ...patch.path];
            });
          }
          api.setState(null, () => [target, patches, inversePatches]);
          return result;
        };
      }
      return value;
    }
  });
};

export const createWithMobx = (
  createMobxState: () => any | Record<string, () => any>
) => {
  if (typeof createMobxState === 'function') {
    return create((get, set, api) => {
      return handleStore(api, createMobxState);
    });
  }
  if (typeof createMobxState === 'object' && createMobxState !== null) {
    return create(
      Object.keys(createMobxState).reduce((acc, key) => {
        acc[key] = (get: any, set: any, api: any) =>
          handleStore(api, createMobxState[key], key);
        return acc;
      }, {} as any)
    );
  }
  throw new Error('createWithMobx must be a function or an object');
};
