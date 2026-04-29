import {
  Computed,
  createCachedGetter,
  createTrackedStateReader
} from './computed';
import type { CreateState } from './interface';
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
  const readStateValue = () =>
    sliceKey
      ? (internal.rootState as any)[sliceKey][key]
      : (internal.rootState as any)[key];
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
    descriptor.get = (descriptor.value as Computed).createGetter({
      internal
    });
  } else if (sliceKey) {
    const read = createTrackedStateReader(
      internal,
      readStateValue,
      descriptor.value
    );
    descriptor.get = () => read();
    descriptor.set = (value: unknown) => {
      (internal.rootState as any)[sliceKey][key] = value;
    };
  } else {
    const read = createTrackedStateReader(
      internal,
      readStateValue,
      descriptor.value
    );
    descriptor.get = () => read();
    descriptor.set = (value: unknown) => {
      (internal.rootState as any)[key] = value;
    };
  }

  // handle state property
  delete descriptor.value;
  delete descriptor.writable;
};

export const prepareAccessorDescriptor = <T extends CreateState>({
  descriptor,
  internal
}: Pick<PrepareStateDescriptorOptions<T>, 'descriptor' | 'internal'>) => {
  if (internal.mutableInstance || typeof descriptor.get !== 'function') {
    return;
  }
  descriptor.get = createCachedGetter(internal, descriptor.get);
};
