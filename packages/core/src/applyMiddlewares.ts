import type { CreateState, ISlices, Middleware, Store } from './interface';

export const applyMiddlewares = <T extends CreateState>(
  store: Store<T>,
  middlewares: Middleware<T>[]
) => {
  return middlewares.reduce((store, middleware, index) => {
    if (process.env.NODE_ENV === 'development') {
      if (typeof middleware !== 'function') {
        throw new Error(`middlewares[${index}] should be a function`);
      }
    }
    const nextStore = middleware(store);
    if (process.env.NODE_ENV === 'development') {
      if (!nextStore || typeof nextStore !== 'object') {
        throw new Error(`middlewares[${index}] should return a store object`);
      }
    }
    return nextStore;
  }, store);
};
