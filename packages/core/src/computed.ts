import type { Store } from './interface';
import { areShallowEqualWithArray } from './utils';

export class Computed {
  constructor(
    public deps: (state: Store['getState']) => any[],
    public fn: (...args: any[]) => any
  ) {}
}

const defaultMemoize = (func: (...args: any) => any) => {
  const lastArgs: WeakMap<any, IArguments | null> = new WeakMap();
  const lastResult: WeakMap<any, unknown> = new WeakMap();
  return function (this: ThisType<unknown>) {
    if (!areShallowEqualWithArray(lastArgs.get(this) ?? [], arguments)) {
      lastResult.set(this, func.apply(this, arguments as any));
    }
    lastArgs.set(this, arguments);
    return lastResult.get(this);
  };
};

const createSelectorCreatorWithArray = (
  memoize: (...args: any) => (..._args: any) => any = defaultMemoize
) => {
  return (
    dependenciesFunc: (that: any) => any[],
    resultFunc: (...args: any) => any
  ) => {
    const memoizedResultFunc = memoize(function (this: ThisType<unknown>) {
      return resultFunc.apply(this, arguments as any);
    });
    return function (this: ThisType<unknown>) {
      return memoizedResultFunc.apply(
        this,
        dependenciesFunc.apply(null, [this])
      );
    };
  };
};

export const createSelectorWithArray = createSelectorCreatorWithArray();
