const isEqual = (x: unknown, y: unknown) => {
  if (x === y) {
    return x !== 0 || y !== 0 || 1 / x === 1 / y;
  }
  // eslint-disable-next-line no-self-compare
  return x !== x && y !== y;
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
      for (const key in source) {
        if (typeof source[key] === 'object' && source[key] !== null) {
          Object.assign(target[key], source[key]);
        }
      }
    }
  } else {
    Object.assign(target, source);
  }
};

export const uuid = () => {
  let timestamp = new Date().getTime();
  const uuidTemplate = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  const uuid = uuidTemplate.replace(/[xy]/g, (char) => {
    let randomNum = (timestamp + Math.random() * 16) % 16 | 0;
    timestamp = Math.floor(timestamp / 16);
    return (char === 'x' ? randomNum : (randomNum & 0x3) | 0x8).toString(16);
  });
  return uuid;
};
