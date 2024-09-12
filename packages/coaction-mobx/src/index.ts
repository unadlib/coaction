import type { Slices, Store } from 'coaction';

export const create = <T extends Slices>(
  createState: (store: Store<T>) => T
) => {
  //
};
