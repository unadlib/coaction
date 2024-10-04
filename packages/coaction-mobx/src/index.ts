import { mutate, apply } from 'mutability';
import { create, ISlices, Slices, type Store } from 'coaction';
import { autorun, runInAction, getAtom } from 'mobx';

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
            const { proxy, revoke } = Proxy.revocable(draft, {
              get(target, key, receiver) {
                const getter = getAtom(mobxState, key).derivation;
                if (getter) {
                  return getter!.call(receiver);
                }
                return Reflect.get(target, key, receiver);
              }
            });
            result = value.apply(proxy, args);
            revoke();
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

export const createWithMobx = <T extends ISlices>(
  createMobxState: Slices<T> | Record<string, Slices<T>>,
  options: any
) => {
  if (typeof createMobxState === 'function') {
    return create((set: any, get: any, api: any) => {
      return handleStore(api, createMobxState.bind(null, set, get, api));
    }, options);
  }
  if (typeof createMobxState === 'object' && createMobxState !== null) {
    return create(
      Object.keys(createMobxState).reduce((acc, key) => {
        acc[key] = (set: any, get: any, api: any) =>
          handleStore(api, createMobxState[key].bind(null, set, get, api), key);
        return acc;
      }, {} as any),
      options
    );
  }
  throw new Error('createWithMobx must be a function or an object');
};
