import { Computed, createSelectorWithArray } from './computed';
import type { CreateState, Store } from './interface';
import type { Internal } from './internal';
import { setOwnEnumerable } from './utils';

type PrepareStateDescriptorOptions<T extends CreateState> = {
  descriptor: PropertyDescriptor;
  internal: Internal<T>;
  key: PropertyKey;
  rawState: Record<PropertyKey, any>;
  sliceKey?: string;
};

export const prepareStateDescriptor = <T extends CreateState>({
  descriptor,
  internal,
  key,
  rawState,
  sliceKey
}: PrepareStateDescriptorOptions<T>) => {
  const isComputed = descriptor.value instanceof Computed;
  if (internal.mutableInstance) {
    Object.defineProperty(rawState, key, {
      get: () => internal.mutableInstance[key],
      set: (value) => {
        internal.mutableInstance[key] = value;
      },
      enumerable: true
    });
  } else if (!isComputed) {
    setOwnEnumerable(rawState, key, descriptor.value);
  }

  if (isComputed) {
    if (internal.mutableInstance) {
      throw new Error('Computed is not supported with mutable instance');
    }
    // manually handle computed property
    const { deps, fn } = descriptor.value as Computed;
    const depsCallbackSelector = createSelectorWithArray(
      // the root state should be updated, and the computed property will be updated.
      () => [internal.rootState],
      () => {
        return deps(internal.module as Store<T>['getState']);
      }
    );
    const selector = createSelectorWithArray(
      (that) => depsCallbackSelector.call(that),
      fn
    );
    descriptor.get = function () {
      return selector.call(this);
    };
  } else if (sliceKey) {
    descriptor.get = () => (internal.rootState as any)[sliceKey][key];
    descriptor.set = (value: unknown) => {
      (internal.rootState as any)[sliceKey][key] = value;
    };
  } else {
    descriptor.get = () => (internal.rootState as any)[key];
    descriptor.set = (value: unknown) => {
      (internal.rootState as any)[key] = value;
    };
  }

  // handle state property
  delete descriptor.value;
  delete descriptor.writable;
};
