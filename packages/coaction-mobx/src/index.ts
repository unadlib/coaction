import { mutate, apply } from 'mutability';
import { create } from 'coaction';
import { autorun, runInAction } from 'mobx';

export const createWithMobx = (getMobxStore: () => any) => {
  return create((get, set, api) => {
    const mobxStore = getMobxStore();
    Object.assign(api, {
      subscribe: autorun
    });
    if (!api.share) {
      return mobxStore;
    }
    if (api.share === 'client') {
      api.apply = (state, patches) => {
        runInAction(() => {
          apply(state, patches);
        });
      };
    }
    if (process.env.NODE_ENV === 'development') {
      // TODO: check with observe for unexpected changes
    }
    // TODO: implement slices Pattern
    return new Proxy(mobxStore, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof value === 'function') {
          return (...args: any) => {
            if (api.share === 'client') {
              return api.transport?.emit('execute', key, args);
            }
            let result: any;
            const { patches, inversePatches } = mutate(target, (draft: any) => {
              result = value.apply(draft, args);
            });
            api.setState(null, [target, patches, inversePatches]);
            return result;
          };
        }
        return value;
      }
    });
  });
};
