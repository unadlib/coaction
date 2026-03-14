import type { Store } from './interface';
import { bindSymbol } from './constant';
import { Internal } from './internal';

/**
 * Build an adapter helper for bridging an external store implementation into
 * Coaction.
 *
 * @remarks
 * Official bindings use this to integrate stores such as Redux, Jotai, Pinia,
 * Zustand, MobX, and Valtio. Binder-backed integrations are whole-store
 * adapters; they are not compatible with Coaction slices mode.
 */
export function createBinder<F = (...args: any[]) => any>({
  handleState,
  handleStore
}: {
  /**
   * Normalize a third-party store instance into a raw state object plus the
   * binding hook used during initialization.
   */
  handleState: <T extends object = object>(
    state: T
  ) => {
    /**
     * Copy of the incoming state object that Coaction should consume.
     */
    copyState: T;
    /**
     * Optional nested key when the adapter exposes a single child object from
     * the third-party store.
     */
    key?: keyof T;
    /**
     * Convert the external state object into the raw state shape used by
     * Coaction.
     */
    bind: (state: T) => T;
  };
  /**
   * Wire Coaction's store lifecycle to the external store implementation.
   */
  handleStore: (
    /**
     * Coaction store wrapper.
     */
    store: Store<object>,
    /**
     * Raw state object returned from `bind`.
     */
    rawState: object,
    /**
     * Original external store state object.
     */
    state: object,
    /**
     * Low-level Coaction adapter hooks used by official bindings.
     */
    internal: Internal<object>,
    /**
     * Optional nested key returned by `handleState`.
     */
    key?: string
  ) => void;
}) {
  return (<S extends object>(state: S): S => {
    const { copyState, key, bind } = handleState(state);
    const value = (key ? copyState[key] : copyState) as {
      [bindSymbol]: {
        handleStore: typeof handleStore;
        bind: typeof bind;
      };
    };
    value[bindSymbol] = {
      handleStore,
      bind
    };
    return copyState;
  }) as F;
}
