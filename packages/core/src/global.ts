const getGlobal = () => {
  let _global;
  if (typeof window !== 'undefined') {
    _global = window;
  } else if (typeof global !== 'undefined') {
    _global = global;
  } else if (typeof self !== 'undefined') {
    _global = self;
  } else {
    _global = {} as typeof globalThis;
  }
  return _global;
};

const _global = getGlobal();

export { _global as global, getGlobal };
