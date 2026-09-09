import { computed as createComputed } from 'alien-signals';
import type { Store } from './interface';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import { areShallowEqualWithArray } from './utils';

type Accessor<T> = () => T;
type GetterContext<T extends CreateState> = {
  internal: Internal<T>;
};

const createComputedRead = <T extends CreateState>(
  internal: Internal<T>,
  read: () => unknown
) => {
  let failure: { error: unknown } | undefined;
  const accessor = createComputed(() => {
    internal.computedReadDepth = (internal.computedReadDepth ?? 0) + 1;
    failure = undefined;
    try {
      return read();
    } catch (error) {
      // Complete the signal evaluation so failed reads still link dependents.
      // Successful values keep their identity and normal signal equality.
      return (failure = { error });
    } finally {
      internal.computedReadDepth -= 1;
    }
  });
  return () => {
    const value = accessor();
    if (failure) throw failure.error;
    return value;
  };
};

export class Computed {
  constructor(
    public deps: (state: Store['getState']) => any[],
    public fn: (...args: any[]) => any
  ) {}

  createGetter<T extends CreateState>({ internal }: GetterContext<T>) {
    // Keep the Computed definition separate from the getter's dynamic receiver.
    // eslint-disable-next-line typescript/no-this-alias
    const computed = this;
    const cache = new WeakMap<object, { args: any[]; value: unknown }>();
    return createCachedGetter(internal, function (this: object) {
      const args = computed.deps(internal.module as Store<T>['getState']);
      const previous = cache.get(this);
      if (previous && areShallowEqualWithArray(previous.args, args))
        return previous.value;
      const value = computed.fn.apply(this, args);
      cache.set(this, { args, value });
      return value;
    });
  }
}

export const createCachedGetter = <T extends CreateState>(
  internal: Internal<T>,
  getter: () => unknown
) => {
  const accessors = new WeakMap<object, Accessor<unknown>>();
  const fallbackReceiver = {};
  return function (this: object) {
    const receiver =
      typeof this === 'object' && this !== null ? this : fallbackReceiver;
    if (internal.isBatching) {
      return getter.call(receiver);
    }
    let accessor = accessors.get(receiver);
    if (!accessor) {
      accessor = createComputedRead(internal, () => getter.call(receiver));
      accessors.set(receiver, accessor);
    }
    return accessor();
  };
};

const defaultMemoize = (func: (...args: any) => any) => {
  const lastArgs: WeakMap<object, IArguments | null> = new WeakMap();
  const lastResult: WeakMap<object, unknown> = new WeakMap();
  const fallbackReceiver = {};
  return function (this: unknown) {
    const receiver =
      (typeof this === 'object' && this !== null) || typeof this === 'function'
        ? (this as object)
        : fallbackReceiver;
    if (
      !lastArgs.has(receiver) ||
      !areShallowEqualWithArray(lastArgs.get(receiver)!, arguments)
    ) {
      lastResult.set(receiver, func.apply(this, arguments as any));
    }
    lastArgs.set(receiver, arguments);
    return lastResult.get(receiver);
  };
};

const createSelectorCreatorWithArray = (
  memoize: (...args: any) => (..._args: any) => any = defaultMemoize
) => {
  return (
    dependenciesFunc: (that: any) => any[],
    resultFunc: (...args: any) => any
  ) => {
    const memoizedResultFunc = memoize(function (this: unknown) {
      return resultFunc.apply(this, arguments as any);
    });
    return function (this: unknown) {
      return memoizedResultFunc.apply(
        this,
        dependenciesFunc.apply(null, [this])
      );
    };
  };
};

export const createSelectorWithArray = createSelectorCreatorWithArray();
