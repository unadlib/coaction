import type { ISlices, Middleware, Store } from './interface';

export const applyMiddlewares = <T extends ISlices>(
  store: Store<T>,
  middlewares: Middleware[]
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
