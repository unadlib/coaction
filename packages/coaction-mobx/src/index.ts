import { apply } from 'mutability';
import { create, ISlices, Slices, type Store } from 'coaction';
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
  api.getMutableInstance = (key: any) => instancesMap.get(key);
  if (api.subscribe !== autorun) {
    Object.assign(api, {
      subscribe: autorun
    });
  }
  if (api.share === 'client') {
    api.apply = (state = api.getState(), patches) => {
      if (!patches) {
        if (api.isSlices) {
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
  if (!api.share) {
    return state;
  }
  if (process.env.NODE_ENV === 'development') {
    // TODO: check with observe for unexpected changes
  }
  return state;
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
          handleStore(api, createMobxState[key].bind(null, set, get, api));
        return acc;
      }, {} as any),
      options
    );
  }
  throw new Error('createMobxState must be a function or an object');
};
