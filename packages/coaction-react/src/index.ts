import { create as createVanilla, type Slice, type Store } from 'coaction';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

export const create = (createState: any, options: any) => {
  const store = createVanilla(createState, options);
  return (selector: any) =>
    useSyncExternalStore(
      store.subscribe,
      () => selector(store.getState()),
      () => selector(store.getInitialState())
    );
};
