import type { Store, StoreReturn } from './interface';

/**
 * wrapStore is a function to wrap the store and return function to get the state with store.
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
