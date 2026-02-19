import type { CreateState, Middleware, Store } from './interface';

const isStoreLike = (value: unknown): value is Store<any> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Store<any>>;
  return (
    typeof candidate.setState === 'function' &&
    typeof candidate.getState === 'function' &&
    typeof candidate.subscribe === 'function' &&
    typeof candidate.destroy === 'function' &&
    typeof candidate.apply === 'function' &&
    typeof candidate.getPureState === 'function'
  );
};

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
      if (!isStoreLike(nextStore)) {
        throw new Error(
          `middlewares[${index}] should return a store-like object`
        );
      }
    }
    return nextStore;
  }, store);
};
