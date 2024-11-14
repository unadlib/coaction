import type { Store } from './interface';

export class Computed {
  constructor(
    public deps: (store: Store<any>) => any[],
    public fn: (...args: any[]) => any
  ) {}
}

const isEqual = (x: unknown, y: unknown) => {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  }
  // eslint-disable-next-line no-self-compare
  return x !== x && y !== y;
};

function areShallowEqualWithArray(
  prev: any[] | null | IArguments,
  next: any[] | null | IArguments
) {
  if (prev === null || next === null || prev.length !== next.length) {
    return false;
  }
  const { length } = prev;
  for (let i = 0; i < length; i += 1) {
    if (!isEqual(prev[i], next[i])) {
      return false;
    }
  }
  return true;
}

function defaultMemoize(func: (...args: any) => any) {
  const lastArgs: WeakMap<any, IArguments | null> = new WeakMap();
  const lastResult: WeakMap<any, unknown> = new WeakMap();
  return function (this: ThisType<unknown>) {
    if (!areShallowEqualWithArray(lastArgs.get(this) ?? [], arguments)) {
      lastResult.set(this, func.apply(this, arguments as any));
    }
    lastArgs.set(this, arguments);
    return lastResult.get(this);
  };
}

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
