import { create as createVanilla, type Slice, type Store } from 'coaction';
import { useSyncExternalStore } from 'use-sync-external-store/shim';

export const create = (createState: any) => {
  const store = createVanilla(createState);
  return (selector: any) =>
    useSyncExternalStore(
      store.subscribe,
      () => selector(store.getState()),
      () => selector(store.getInitialState())
    );
};
