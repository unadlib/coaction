import { createBinder, replaceExternalStoreState } from 'coaction/adapter';
import type { AnyAction, Reducer, Store as ReduxStore } from '@reduxjs/toolkit';

export * from '@reduxjs/toolkit';

export const COACTION_REDUX_REPLACE = '@@coaction/redux/replace';

const isUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' &&
  (key === '__proto__' || key === 'prototype' || key === 'constructor');

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const isArrayIndexKey = (key: PropertyKey) => {
  if (typeof key !== 'string') {
    return false;
  }
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    String(index) === key
  );
};

const isObjectRecord = (value: object) =>
  Object.prototype.toString.call(value) === '[object Object]';

function stripFunctions<T>(
  value: T,
  visited = new WeakMap<object, unknown>()
): T {
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return visited.get(value) as T;
    }
    const next: unknown[] = [];
    visited.set(value, next);
    next.length = value.length;
    for (let index = 0; index < value.length; index += 1) {
      if (Object.prototype.hasOwnProperty.call(value, index)) {
        next[index] = stripFunctions(value[index], visited);
      }
    }
    const source = value as unknown as Record<PropertyKey, unknown>;
    const target = next as unknown as Record<PropertyKey, unknown>;
    for (const key of getOwnEnumerableKeys(value)) {
      if (isArrayIndexKey(key) || isUnsafeKey(key)) {
        continue;
      }
      const child = source[key];
      if (typeof child === 'function') {
        continue;
      }
      target[key] = stripFunctions(child, visited);
    }
    return next as T;
  }
  if (typeof value === 'object' && value !== null) {
    if (!isObjectRecord(value)) {
      return value;
    }
    if (visited.has(value)) {
      return visited.get(value) as T;
    }
    const next: Record<PropertyKey, unknown> = {};
    visited.set(value, next);
    for (const key of getOwnEnumerableKeys(value)) {
      if (isUnsafeKey(key)) {
        continue;
      }
      const child = (value as Record<PropertyKey, unknown>)[key];
      if (typeof child === 'function') {
        continue;
      }
      next[key] = stripFunctions(child, visited);
    }
    return next as T;
  }
  return value;
}

export type ReplaceStateAction<S> = {
  type: typeof COACTION_REDUX_REPLACE;
  payload: S;
};

export function replaceStateAction<S>(payload: S): ReplaceStateAction<S> {
  return {
    type: COACTION_REDUX_REPLACE,
    payload
  };
}

export const withCoactionReducer =
  <S, A extends AnyAction = AnyAction>(
    reducer: Reducer<S, A>
  ): Reducer<S, A | ReplaceStateAction<S>> =>
  (state, action) => {
    if (action.type === COACTION_REDUX_REPLACE) {
      return stripFunctions((action as ReplaceStateAction<S>).payload);
    }
    return reducer(state, action as A);
  };

type BoundReduxStore<S extends object, A extends AnyAction> = ReduxStore<
  S,
  A
> & {
  getState: () => BoundReduxState<S, A>;
};

type BoundReduxState<S extends object, A extends AnyAction> = S & {
  dispatch: ReduxStore<S, A>['dispatch'];
};

/**
 * Bind a redux toolkit store to coaction.
 */
export const bindRedux = <S extends object, A extends AnyAction = AnyAction>(
  reduxStore: ReduxStore<S, A>
): BoundReduxStore<S, A> => {
  const originalGetState = reduxStore.getState.bind(reduxStore);
  let isReduxUpdating = false;
  let isCoactionUpdating = false;
  const bindState = createBinder<(state: S) => S>({
    handleStore: (coactionStore, rawState, state, internal) => {
      if (coactionStore.share === 'client') {
        throw new Error('client redux store cannot be updated');
      }
      const unsubscribe = reduxStore.subscribe(() => {
        if (isCoactionUpdating) {
          return;
        }
        isReduxUpdating = true;
        try {
          replaceExternalStoreState(
            coactionStore,
            internal,
            originalGetState() as Record<PropertyKey, unknown>,
            {
              syncImmutable: false
            }
          );
        } finally {
          isReduxUpdating = false;
        }
      });
      const baseDestroy = coactionStore.destroy;
      let destroyed = false;
      coactionStore.destroy = () => {
        if (destroyed) {
          return;
        }
        destroyed = true;
        unsubscribe();
        baseDestroy();
      };
      internal.updateImmutable = (nextState: any) => {
        if (isReduxUpdating) {
          return;
        }
        isCoactionUpdating = true;
        try {
          reduxStore.dispatch(replaceStateAction(nextState) as unknown as A);
        } finally {
          isCoactionUpdating = false;
        }
        internal.listeners.forEach((listener) => internal.notify(listener));
      };
    },
    handleState: ((state: S) => {
      const copyState = Object.defineProperties(
        {},
        {
          ...Object.getOwnPropertyDescriptors(state),
          dispatch: {
            enumerable: false,
            configurable: true,
            writable: false,
            value: reduxStore.dispatch.bind(reduxStore)
          }
        }
      ) as S;
      return {
        copyState,
        bind: (rawState: S) => rawState
      };
    }) as any
  });
  const store = reduxStore as BoundReduxStore<S, A>;
  store.getState = () =>
    bindState(originalGetState()) as ReturnType<
      BoundReduxStore<S, A>['getState']
    >;
  return store;
};

/**
 * Adapt a redux store type to state type.
 */
export function adapt<T extends object, A extends AnyAction = AnyAction>(
  store: BoundReduxStore<T, A>
): BoundReduxState<T, A>;
export function adapt<T extends object>(store: ReduxStore<T>): T;
export function adapt(store: ReduxStore<any>) {
  return store as any;
}
