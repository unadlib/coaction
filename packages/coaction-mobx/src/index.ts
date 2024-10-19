import { apply } from 'mutability';
import { create, ISlices, Slice, type Store } from 'coaction';
import {
  autorun,
  runInAction,
  makeAutoObservable as makeAutoObservableMobx
} from 'mobx';

const instancesMap = new Map<object, any>();

export const makeAutoObservable = (options: any) => {
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const copyState = Object.defineProperties({}, descriptors);
  const rawState = Object.defineProperties({}, descriptors);
  const mobxState = makeAutoObservableMobx(copyState);
  instancesMap.set(rawState, mobxState);
  return rawState;
};

const handleStore = (api: Store<object>, createMobxState: () => any) => {
  if (!api.toRaw) {
    api.toRaw = (key: any) => instancesMap.get(key);
    Object.assign(api, {
      subscribe: autorun
    });
    api.apply = (state = api.getState(), patches) => {
      if (!patches) {
        if (api.isSliceStore) {
          if (typeof state === 'object' && state !== null) {
            runInAction(() => {
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
            });
          }
        } else {
          runInAction(() => {
            Object.assign(api.getState(), state);
          });
        }
        return;
      }
      runInAction(() => {
        apply(state, patches!);
      });
    };
  }
  const state = createMobxState();
  if (process.env.NODE_ENV === 'development') {
    // TODO: check with observe for unexpected changes
  }
  return state;
};

export const createWithMobx = <T extends ISlices>(
  createMobxState: Slice<T> | Record<string, Slice<T>>,
  options: any
) => {
  if (typeof createMobxState === 'function') {
    return create(
      (set: any, get: any, api: any) => {
        return handleStore(api, createMobxState.bind(null, set, get, api));
      },
      { ...options, enablePatches: true }
    );
  }
  if (typeof createMobxState === 'object' && createMobxState !== null) {
    return create(
      Object.keys(createMobxState).reduce((acc, key) => {
        acc[key] = (set: any, get: any, api: any) =>
          handleStore(api, createMobxState[key].bind(null, set, get, api));
        return acc;
      }, {} as any),
      { ...options, enablePatches: true }
    );
  }
  throw new Error('createMobxState must be a function or an object');
};
