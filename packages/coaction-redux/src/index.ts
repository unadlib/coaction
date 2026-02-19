import { createBinder, type Store } from 'coaction';
import type { AnyAction, Reducer, Store as ReduxStore } from '@reduxjs/toolkit';

export * from '@reduxjs/toolkit';

export const COACTION_REDUX_REPLACE = '@@coaction/redux/replace';

const stripFunctions = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripFunctions(item)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    const next: Record<string, unknown> = {};
    for (const key in value as Record<string, unknown>) {
      const child = (value as Record<string, unknown>)[key];
      if (typeof child === 'function') {
        continue;
      }
      next[key] = stripFunctions(child);
    }
    return next as T;
  }
  return value;
};

export type ReplaceStateAction<S> = {
  type: typeof COACTION_REDUX_REPLACE;
  payload: S;
};

export const replaceStateAction = <S>(payload: S): ReplaceStateAction<S> => ({
  type: COACTION_REDUX_REPLACE,
  payload
});

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
  getState: () => S & {
    dispatch: ReduxStore<S, A>['dispatch'];
  };
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
      reduxStore.subscribe(() => {
        if (isCoactionUpdating) {
          return;
        }
        isReduxUpdating = true;
        try {
          coactionStore.setState(reduxStore.getState() as any);
        } finally {
          isReduxUpdating = false;
        }
      });
      internal.updateImmutable = (nextState: any) => {
        if (isReduxUpdating) {
          return;
        }
        isCoactionUpdating = true;
        try {
          reduxStore.dispatch(replaceStateAction(nextState) as A);
        } finally {
          isCoactionUpdating = false;
        }
      };
    },
    handleState: (state) => {
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
        bind: (rawState) => rawState
      };
    }
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
export const adapt = <T extends object>(store: ReduxStore<T>) =>
  store as unknown as T;
