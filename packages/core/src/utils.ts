const isEqual = (x: unknown, y: unknown) => {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  }
  return x !== x && y !== y;
};

const isUnsafeKey = (key: string) =>
  key === '__proto__' || key === 'prototype' || key === 'constructor';

const assignOwnEnumerable = (
  target: Record<string, unknown>,
  source: Record<string, unknown>
) => {
  for (const key of Object.keys(source)) {
    if (isUnsafeKey(key)) {
      continue;
    }
    target[key] = source[key];
  }
};

export const areShallowEqualWithArray = (
  prev: any[] | null | IArguments,
  next: any[] | null | IArguments
) => {
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
};

export const mergeObject = (target: any, source: any, isSlice?: boolean) => {
  if (isSlice) {
    if (typeof source === 'object' && source !== null) {
      for (const key of Object.keys(source)) {
        if (isUnsafeKey(key)) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
          continue;
        }
        const sourceValue = source[key];
        if (typeof sourceValue !== 'object' || sourceValue === null) {
          continue;
        }
        const targetValue = target[key];
        if (typeof targetValue === 'object' && targetValue !== null) {
          assignOwnEnumerable(targetValue, sourceValue);
        }
      }
    }
  } else {
    if (typeof source === 'object' && source !== null) {
      assignOwnEnumerable(target, source);
    }
  }
};

export const uuid = () => {
  let timestamp = new Date().getTime();
  const uuidTemplate = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  const uuid = uuidTemplate.replace(/[xy]/g, (char) => {
    const randomNum = ((timestamp + Math.random() * 16) % 16) | 0;
    timestamp = Math.floor(timestamp / 16);
    return (char === 'x' ? randomNum : (randomNum & 0x3) | 0x8).toString(16);
  });
  return uuid;
};
