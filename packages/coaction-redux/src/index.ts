import type { Slice, Store } from 'coaction';

export const create = <T extends Slice>(
  createState: (store: Store<T>) => T
) => {
  //
};
