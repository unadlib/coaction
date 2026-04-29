import {
  computed as createComputed,
  endBatch,
  signal,
  startBatch
} from 'alien-signals';
import type { Store } from './interface';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import { areShallowEqualWithArray } from './utils';

type Accessor<T> = () => T;
type GetterContext<T extends CreateState> = {
  internal: Internal<T>;
};

export class Computed {
  constructor(
    public deps: (state: Store['getState']) => any[],
    public fn: (...args: any[]) => any
  ) {}

  createGetter<T extends CreateState>({ internal }: GetterContext<T>) {
    const memoByReceiver = new WeakMap<object, Accessor<unknown>>();
    const lastArgs = new WeakMap<object, any[]>();
    const lastResult = new WeakMap<object, unknown>();
    const fallbackReceiver = {};
    const evaluate = (receiver: object) => {
      const args = this.deps(internal.module as Store<T>['getState']);
      if (!areShallowEqualWithArray(lastArgs.get(receiver) ?? [], args)) {
        lastResult.set(receiver, this.fn.apply(receiver, args));
      }
      lastArgs.set(receiver, args);
      return lastResult.get(receiver);
    };
    return function (this: object) {
      const receiver =
        typeof this === 'object' && this !== null ? this : fallbackReceiver;
      if (internal.isBatching) {
        return evaluate(receiver);
      }
      let accessor = memoByReceiver.get(receiver);
      if (!accessor) {
        accessor = createComputed(() => evaluate(receiver));
        memoByReceiver.set(receiver, accessor);
      }
      return accessor();
    };
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
      accessor = createComputed(() => getter.call(receiver));
      accessors.set(receiver, accessor);
    }
    return accessor();
  };
};

export const createTrackedStateReader = <T extends CreateState>(
  internal: Internal<T>,
  read: () => unknown,
  initialValue: unknown
) => {
  const slotSignal = signal(initialValue);
  const slot = {
    refresh: () => {
      slotSignal(read());
    }
  };
  (internal.signalSlots ??= new Set()).add(slot);
  return () => {
    slotSignal();
    return read();
  };
};

export const refreshSignalSlots = <T extends CreateState>(
  internal: Internal<T>
) => {
  if (!internal.signalSlots?.size) {
    return;
  }
  startBatch();
  try {
    internal.signalSlots.forEach((slot) => slot.refresh());
  } finally {
    endBatch();
  }
};

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
