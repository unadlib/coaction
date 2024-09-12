import { mutate } from 'mutability';

export const mobx = (mobxStore: any) => {
  return () => {
    return new Proxy(mobxStore, {
      get(target, key, receiver) {
        if (typeof target[key] === 'function') {
          return (...args: any) => {
            const { patches, inversePatches } = mutate(target, (draft: any) => {
              return target[key].apply(draft, args);
            });
            console.log(patches, inversePatches);
          };
        }
        return Reflect.get(target, key, receiver);
      }
    });
  };
};
