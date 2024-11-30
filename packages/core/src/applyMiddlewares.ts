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
    return middleware(store);
  }, store);
};
