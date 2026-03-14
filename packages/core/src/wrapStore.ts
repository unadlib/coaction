import type { Store, StoreReturn } from './interface';

/**
 * Convert a store object into Coaction's callable store shape.
 *
 * @remarks
 * Framework bindings use this to attach selector-aware readers while
 * preserving the underlying store API on the returned function object. Most
 * applications should call {@link create} instead of using `wrapStore()`
 * directly.
 */
export const wrapStore = <T extends object>(
  store: Store<T>,
  getState: (...args: unknown[]) => T = () => store.getState()
) => {
  const { name, ..._store } = store;
  return Object.assign(
    {
      [name]: (...args: unknown[]) => getState(...args)
    }[name],
    _store
  ) as StoreReturn<T>;
};
