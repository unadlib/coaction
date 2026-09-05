import { Computed } from './computed';
import type { JsonValue } from './jsonTypes';
import { isUnsafeKey } from './utils';

export type { JsonPrimitive, JsonValue } from './jsonTypes';

type JsonPath = readonly PropertyKey[];

type ActionRootMode = false | 'initial' | 'replacement';

type JsonWork = {
  actionRoot?: ActionRootMode;
  path: JsonPath;
  value: unknown;
};

const formatPath = (path: JsonPath) =>
  path.length ? path.map((key) => String(key)).join('.') : '<root>';

const unsupported = (label: string, path: JsonPath): never => {
  throw new TypeError(
    `${label} is not supported because this state is synchronized as JSON. Found unsupported value at ${formatPath(path)}.`
  );
};

const getDescriptors = (value: object, path: JsonPath) => {
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    return unsupported('Uninspectable state', path);
  }
};

const getPrototype = (value: object, path: JsonPath) => {
  try {
    return Object.getPrototypeOf(value);
  } catch {
    return unsupported('Uninspectable state prototype', path);
  }
};

const assertNoInheritedToJson = (prototype: object | null, path: JsonPath) => {
  let current = prototype;
  while (current) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, 'toJSON');
    } catch {
      unsupported('Uninspectable inherited toJSON state', path);
    }
    if (descriptor) {
      if (
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        typeof descriptor.value === 'function'
      ) {
        unsupported('Inherited toJSON state', path);
      }
      return;
    }
    current = getPrototype(current, path);
  }
};

const isArrayIndex = (key: string, length: number) => {
  const index = Number(key);
  return (
    key !== '' &&
    Number.isSafeInteger(index) &&
    index >= 0 &&
    index < length &&
    String(index) === key
  );
};

const pushDataProperty = (
  work: JsonWork[],
  descriptor: PropertyDescriptor | undefined,
  key: PropertyKey,
  path: JsonPath,
  actionRoot: ActionRootMode = false
) => {
  const nextPath = [...path, key];
  if (!descriptor) {
    return unsupported('Sparse array state', nextPath);
  }
  if (!descriptor.enumerable) {
    return unsupported('Non-enumerable data state', nextPath);
  }
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return unsupported('Accessor-backed state', nextPath);
  }
  work.push({ actionRoot, path: nextPath, value: descriptor.value });
};

const assertSharedJsonWork = (work: JsonWork[], isSliceStore = false) => {
  const seen = new WeakSet<object>();

  while (work.length) {
    const { actionRoot = false, path, value } = work.pop()!;
    if (value === null) {
      continue;
    }
    switch (typeof value) {
      case 'string':
      case 'boolean':
        continue;
      case 'number':
        if (!Number.isFinite(value)) {
          unsupported('NaN or infinite number state', path);
        }
        if (Object.is(value, -0)) {
          unsupported('Negative zero state', path);
        }
        continue;
      case 'bigint':
        unsupported('BigInt-valued state', path);
      case 'undefined':
        unsupported('Undefined-valued state', path);
      case 'function':
        unsupported('Function-valued state', path);
      case 'symbol':
        throw new TypeError(
          `Symbol-valued state is not supported because this state is synchronized as JSON. Found symbol value at ${formatPath(path)}.`
        );
      default:
        break;
    }

    const object = value as object;
    if (seen.has(object)) {
      unsupported('Repeated state reference', path);
    }
    seen.add(object);

    const descriptors = getDescriptors(object, path);
    if (Array.isArray(object)) {
      const prototype = getPrototype(object, path);
      if (prototype !== Array.prototype) {
        unsupported('Non-plain array state', path);
      }
      assertNoInheritedToJson(prototype, path);
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0) {
        unsupported('Invalid array state', path);
      }
      for (const key of Reflect.ownKeys(descriptors)) {
        if (key === 'length') {
          continue;
        }
        if (typeof key === 'symbol') {
          throw new TypeError(
            `Symbol-keyed state is not supported because this state is synchronized as JSON with string paths. Found symbol key at ${formatPath([...path, key])}.`
          );
        }
        if (!isArrayIndex(key, length)) {
          unsupported('Non-index array property state', [...path, key]);
        }
      }
      for (let index = 0; index < length; index += 1) {
        pushDataProperty(work, descriptors[index], index, path);
      }
      continue;
    }

    const prototype = getPrototype(object, path);
    if (prototype !== Object.prototype && prototype !== null) {
      unsupported('Non-plain object state', path);
    }
    assertNoInheritedToJson(prototype, path);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === 'symbol') {
        throw new TypeError(
          `Symbol-keyed state is not supported because this state is synchronized as JSON with string paths. Found symbol key at ${formatPath([...path, key])}.`
        );
      }
      if (isUnsafeKey(key)) {
        unsupported('Unsafe-keyed state', [...path, key]);
      }
      const descriptor = descriptors[key];
      if (actionRoot && descriptor) {
        const isDataProperty = Object.prototype.hasOwnProperty.call(
          descriptor,
          'value'
        );
        if (isDataProperty && typeof descriptor.value === 'function') {
          continue;
        }
        if (
          actionRoot === 'initial' &&
          (!isDataProperty || descriptor.value instanceof Computed)
        ) {
          continue;
        }
      }
      pushDataProperty(
        work,
        descriptor,
        key,
        path,
        isSliceStore && path.length === 0 ? 'initial' : false
      );
    }
  }
};

export const assertSharedJsonValue: (
  root: unknown
) => asserts root is JsonValue = (root) => {
  assertSharedJsonWork([{ path: [], value: root }]);
};

export const validateSharedInitialState = (
  root: unknown,
  isSliceStore = false
) => {
  assertSharedJsonWork(
    [{ actionRoot: isSliceStore ? false : 'initial', path: [], value: root }],
    isSliceStore
  );
};

export const validateSharedReplacementSource = (root: unknown) => {
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    unsupported('Non-record replacement state', []);
  }
  assertSharedJsonWork([{ actionRoot: 'replacement', path: [], value: root }]);
};

export const encodeSharedJson = (value: unknown) => {
  assertSharedJsonValue(value);
  const encoded = JSON.stringify(value);
  if (typeof encoded !== 'string') {
    throw new TypeError('Shared transport value could not be encoded as JSON.');
  }
  return encoded;
};

export const decodeSharedJson = (encoded: unknown): JsonValue => {
  if (typeof encoded !== 'string') {
    throw new TypeError('Shared transport payload must be a JSON string.');
  }
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw new TypeError('Shared transport payload is not valid JSON.');
  }
  assertSharedJsonValue(value);
  return value;
};

export const validateSharedActionPaths = (
  state: unknown,
  isSliceStore = false
) => {
  const actions = new Set<string>();
  const work: Array<{ actionRoot: boolean; path: string[]; value: unknown }> = [
    { actionRoot: !isSliceStore, path: [], value: state }
  ];
  const seen = new WeakSet<object>();
  while (work.length) {
    const { actionRoot, path, value } = work.pop()!;
    if (typeof value !== 'object' || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const descriptors = getDescriptors(value, path);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key === 'symbol') {
        throw new TypeError(
          `Symbol-keyed state is not supported because this state is synchronized as JSON with string paths. Found symbol key at ${formatPath([...path, key])}.`
        );
      }
      const descriptor = descriptors[key];
      if (
        descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        const nextPath = [...path, key];
        if (actionRoot && typeof descriptor.value === 'function') {
          actions.add(JSON.stringify(nextPath));
          continue;
        }
        work.push({
          actionRoot: isSliceStore && path.length === 0,
          path: nextPath,
          value: descriptor.value
        });
      }
    }
  }
  return actions;
};

export const validateSharedStateSerializable: (
  state: unknown
) => asserts state is JsonValue = assertSharedJsonValue;
