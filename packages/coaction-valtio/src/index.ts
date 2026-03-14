import { apply } from 'mutability';
import { createBinder, type Store } from 'coaction';
import { proxy, subscribe } from 'valtio/vanilla';

export * from 'valtio/vanilla';

const instancesMap = new WeakMap<object, object>();

type ValtioInternal = {
  toMutableRaw?: (key: object) => object | undefined;
};

type StoreWithDestroyers = Store<object> & {
  _destroyers?: Set<() => void>;
};

const handleStore = (
  store: StoreWithDestroyers,
  rawState: object,
  state: object,
  internal: ValtioInternal
) => {
  if (!internal.toMutableRaw) {
    internal.toMutableRaw = (key: object) => instancesMap.get(key);
    const getMutableState = () => internal.toMutableRaw?.(rawState) ?? rawState;
    store._destroyers = new Set();
    Object.assign(store, {
      subscribe: (listener: () => void) => {
        const unsubscribe = subscribe(getMutableState(), listener);
        store._destroyers!.add(unsubscribe);
        return () => {
          unsubscribe();
          store._destroyers?.delete(unsubscribe);
        };
      }
    });
    const baseDestroy = store.destroy;
    store.destroy = () => {
      store._destroyers?.forEach((destroy) => destroy());
      store._destroyers?.clear();
      store._destroyers = undefined;
      baseDestroy();
    };
    store.apply = (state = store.getState(), patches) => {
      if (!patches) {
        Object.assign(store.getState(), state);
        return;
      }
      apply(state, patches);
    };
  }
};

interface BindValtio {
  <T extends object>(target: T): T;
}

/**
 * Bind a store to Valtio.
 */
export const bindValtio = createBinder<BindValtio>({
  handleStore,
  handleState: (options) => {
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const copyState = Object.defineProperties(
      {},
      descriptors
    ) as typeof options;
    const rawState = Object.defineProperties({}, descriptors) as typeof options;
    return {
      copyState,
      bind: (state) => {
        instancesMap.set(rawState, state);
        return rawState;
      }
    };
  }
});

/**
 * Adapt a Valtio store type to state type.
 */
export const adapt = <T extends object>(store: T) => store as T;

export { proxy };
