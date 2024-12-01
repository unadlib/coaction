import { apply } from 'mutability';
import { createBinder, type Store } from 'coaction';
import { createPinia, setActivePinia } from 'pinia';
import type {
  _GettersTree,
  DefineStoreOptions,
  StateTree,
  StoreDefinition
} from 'pinia';

const instancesMap = new WeakMap<object, unknown>();

type StoreWithSubscriptions = Store<object> & {
  // TODO: fix type
  _subscriptions?: Set<(...args: any) => void>;
  _destroyers?: Set<() => void>;
};

type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

type ReadonlyKeys<T> = {
  [K in keyof T]: Equal<
    { [P in K]: T[P] },
    Readonly<{ [P in K]: T[P] }>
  > extends true
    ? K
    : never;
}[keyof T];

export type IStore<T extends object> = [
  string,
  Pick<T, Exclude<keyof T, ReadonlyKeys<T> | FunctionKeys<T>>>,
  {
    [K in ReadonlyKeys<T>]: (
      state: Pick<T, Exclude<keyof T, ReadonlyKeys<T> | FunctionKeys<T>>>
    ) => T[K];
  },
  Pick<T, FunctionKeys<T>>
];

const handleStore = (store: StoreWithSubscriptions, state: object) => {
  if (!store.toRaw) {
    store.toRaw = (key: any) => instancesMap.get(key);
    Object.assign(store, {
      subscribe: (callback: any) => {
        store._subscriptions!.add(callback);
        return () => store._subscriptions!.delete(callback);
      }
    });
    store._subscriptions = new Set<() => void>();
    store._destroyers = new Set<() => void>();
    const baseDestroy = store.destroy;
    store.destroy = () => {
      baseDestroy();
      store._subscriptions!.clear();
      store._subscriptions = undefined;
      store._destroyers!.forEach((destroy) => destroy());
      store._destroyers = undefined;
    };
    store.apply = (state = store.getState(), patches) => {
      // console.log('apply', state, patches);
      if (!patches) {
        if (state === store.getState()) return;
        if (store.isSliceStore) {
          if (typeof state === 'object' && state !== null) {
            for (const key in state) {
              const _key = key as keyof typeof state;
              const _state = state[_key];
              if (typeof _state === 'object' && _state !== null) {
                Object.assign(store.getState()[_key], _state);
              }
            }
          }
        } else {
          Object.assign(store.getState(), state);
        }
        return;
      }
      apply(state, patches);
    };
  }
  const stopWatch = store.toRaw(state).$subscribe((...args: unknown[]) => {
    store._subscriptions!.forEach((callback) => callback(...args));
  });
  const destroy = () => {
    instancesMap.delete(state);
    stopWatch();
  };
  store._destroyers!.add(destroy);
};

/**
 * Bind a store to Pinia
 */
export const bindPinia = createBinder({
  handleStore,
  handleState: ((options: DefineStoreOptions<any, any, any, any>) => {
    const descriptors: Record<string, PropertyDescriptor> = {};
    options.getters = options.getters ?? {};
    for (const key in options.getters) {
      descriptors[key] = {
        get() {
          return options.getters[key].call(this, this);
        }
      };
    }
    const rawState = Object.defineProperties(
      {
        ...options.state?.(),
        ...options.actions
      },
      descriptors
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    return {
      copyState: options as any,
      key: 'actions',
      bind: (state: any) => {
        rawState.name = state.$id;
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }) as any
}) as <
  Id extends string,
  S extends StateTree = {},
  G extends _GettersTree<S> = {},
  A = {}
>(
  options: Omit<DefineStoreOptions<Id, S, G, A>, 'id'>
) => Omit<DefineStoreOptions<Id, S, G, A>, 'id'>;

/**
 * Adapt a store type to Pinia
 */
export const adapt = <T extends object>(
  store: StoreDefinition<IStore<T>[0], IStore<T>[1], IStore<T>[2], IStore<T>[3]>
) => store as any as T;

export type PiniaStore<T extends object> = StoreDefinition<
  IStore<T>[0],
  IStore<T>[1],
  IStore<T>[2],
  IStore<T>[3]
>;
