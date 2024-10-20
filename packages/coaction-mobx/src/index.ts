import { apply } from 'mutability';
import { create, type ISlices, type Slice, type Store } from 'coaction';
import { autorun, runInAction, _getAdministration } from 'mobx';

const instancesMap = new Map<object, any>();

const mapState = (mobxState: object) => {
  const stateMap = _getAdministration(mobxState).values_;
  if (!(stateMap instanceof Map)) {
    throw new Error(`the state should be a Mobx state.`);
  }
  const rawState = {} as Record<string, any>;
  stateMap.forEach((value, key) => {
    if (typeof value.value_ === 'function') {
      rawState[key] = value.value_;
      return;
    }
    if (value.derivation) {
      Object.defineProperty(rawState, key, {
        get: value.derivation,
        enumerable: false
      });
      return;
    }
    rawState[key] = JSON.parse(JSON.stringify(value.value_));
  });
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
  const state = mapState(createMobxState());
  if (process.env.NODE_ENV === 'development') {
    // TODO: check with observe for unexpected changes
  }
  return state;
};

export const mobx = <T extends ISlices>(
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
