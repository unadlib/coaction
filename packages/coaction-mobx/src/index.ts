import { mutate, apply } from 'mutability';
import { create } from 'coaction';
import { autorun, runInAction } from 'mobx';

export const createWithMobx = (getMobxStore: () => any) => {
  return create((get: any, set: any, api: any) => {
    const mobxStore = getMobxStore();
    api.subscribe = autorun;
    console.log('api.share', api.share);
    if (!api.share) {
      return mobxStore;
    }
    if (api.share === 'client') {
      api.apply = (...args: any[]) => {
        runInAction(() => {
          apply(...args);
        });
      };
    }
    return new Proxy(mobxStore, {
      get(target, key, receiver) {
        if (typeof target[key] === 'function') {
          return (...args: any) => {
            if (api.share === 'client') {
              return api.transport.emit('execute', key, args);
            }
            let result: any;
            const { patches, inversePatches } = mutate(target, (draft: any) => {
              result = target[key].apply(draft, args);
            });
            console.log('proxy set!!!');
            api.setState({}, [target, patches, inversePatches]);
            return result;
          };
        }
        return Reflect.get(target, key, receiver);
      }
    });
  });
};
