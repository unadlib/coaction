import { apply } from 'mutability';
import { type Store, createBinder } from 'coaction';

const instancesMap = new WeakMap<object, object>();

// const handleStore = (store: Store<object>) => {
//   //
// };

// interface BindMobx {
//   <T>(target: T): T;
// }

// /**
//  * Bind a store to Zustand
//  */
// export const bindZustand = createBinder<BindZustand>({
//   handleStore,
//   handleState: (options) => {
//     //
//   }
// });
