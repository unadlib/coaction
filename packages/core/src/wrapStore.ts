import type { Store, StoreReturn } from './interface';

/**
 * Convert a store object into Coaction's callable store shape.
 *
 * @remarks
 * Framework bindings use this to attach selector-aware readers while
 * preserving the underlying store API on the returned function object. Most
 * applications should use a public `create` entry instead of calling
 * `wrapStore()` directly. Framework authors import this helper from
 * `coaction` or `coaction/adapter`.
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
