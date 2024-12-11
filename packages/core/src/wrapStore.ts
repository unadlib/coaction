import type { Store, StoreReturn } from './interface';

/**
 * wrapStore is a function to wrap the store and return function to get the state with store.
 */
export const wrapStore = (
  store: Store<any>,
  getState: (...args: any[]) => any = () => store.getState()
) => {
  const { name, ..._store } = store;
  return Object.assign(
    {
      [name]: (...args: any[]) => getState(...args)
    }[name],
    _store
  ) as StoreReturn<any>;
};
