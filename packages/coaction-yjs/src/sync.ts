import * as Y from 'yjs';
import { clone, isPlainObject } from './shared';
import { createYArray, createYMap, toYValue } from './yjsValue';

function isEqualValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!isEqualValue(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        return false;
      }
      if (!isEqualValue(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

export function syncObjectToYMap(
  target: Y.Map<unknown>,
  previous: Record<string, unknown>,
  source: Record<string, unknown>
) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(source)]);
  for (const key of keys) {
    const hasPrevious = Object.prototype.hasOwnProperty.call(previous, key);
    const hasNext = Object.prototype.hasOwnProperty.call(source, key);
    if (!hasNext) {
      target.delete(key);
      continue;
    }
    const previousValue = hasPrevious ? previous[key] : undefined;
    const nextValue = source[key];
    if (hasPrevious && isEqualValue(previousValue, nextValue)) {
      continue;
    }
    const current = target.get(key);
    if (Array.isArray(nextValue)) {
      if (Array.isArray(previousValue) && current instanceof Y.Array) {
        syncArrayToYArray(current, previousValue, nextValue);
      } else {
        target.set(key, createYArray(nextValue));
      }
      continue;
    }
    if (isPlainObject(nextValue)) {
      if (isPlainObject(previousValue) && current instanceof Y.Map) {
        syncObjectToYMap(current, previousValue, nextValue);
      } else {
        target.set(key, createYMap(nextValue));
      }
      continue;
    }
    const normalized =
      typeof nextValue === 'object' && nextValue !== null
        ? clone(nextValue)
        : nextValue;
    if (!Object.is(current, normalized)) {
      target.set(key, normalized);
    }
  }
}

export function syncArrayToYArray(
  target: Y.Array<unknown>,
  previous: unknown[],
  source: unknown[]
) {
  if (target.length > source.length) {
    target.delete(source.length, target.length - source.length);
  }
  const maxLength = Math.max(previous.length, source.length);
  for (let index = 0; index < maxLength; index += 1) {
    const hasPrevious = index < previous.length;
    const hasNext = index < source.length;
    if (!hasNext) {
      continue;
    }
    const previousValue = hasPrevious ? previous[index] : undefined;
    const nextValue = source[index];
    if (hasPrevious && isEqualValue(previousValue, nextValue)) {
      continue;
    }
    if (index >= target.length) {
      target.insert(index, [toYValue(nextValue)]);
      continue;
    }
    const current = target.get(index);
    if (Array.isArray(nextValue)) {
      if (Array.isArray(previousValue) && current instanceof Y.Array) {
        syncArrayToYArray(current, previousValue, nextValue);
      } else {
        target.delete(index, 1);
        target.insert(index, [createYArray(nextValue)]);
      }
      continue;
    }
    if (isPlainObject(nextValue)) {
      if (isPlainObject(previousValue) && current instanceof Y.Map) {
        syncObjectToYMap(current, previousValue, nextValue);
      } else {
        target.delete(index, 1);
        target.insert(index, [createYMap(nextValue)]);
      }
      continue;
    }
    const normalized =
      typeof nextValue === 'object' && nextValue !== null
        ? clone(nextValue)
        : nextValue;
    if (!Object.is(current, normalized)) {
      target.delete(index, 1);
      target.insert(index, [normalized]);
    }
  }
}
