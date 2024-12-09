import { create as createVanilla, type Slice, type Store } from 'coaction';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

export * from 'coaction';

export const create = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  const { name, ..._store } = store;
  return Object.assign(
    {
      [name]: (selector: any) =>
        useSyncExternalStore(
          store.subscribe,
          () => selector(store.getState()),
          () => selector(store.getInitialState())
        )
    }[name],
    _store
  ) as any;
};
