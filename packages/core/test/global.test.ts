import { getGlobal, global as _global } from '../src/global';

describe('getGlobal', () => {
  it('should return the global object', () => {
    const globalObj = getGlobal();
    expect(globalObj).toBeDefined();
  });

  it('should contain specific properties', () => {
    const globalObj = getGlobal();
    expect(globalObj.Math).toBeDefined();
  });
});

describe('_global', () => {
  it('should be the same as getGlobal()', () => {
    const globalObj = getGlobal();
    expect(_global).toBe(globalObj);
  });

  it('should have the correct type based on the environment', () => {
    if (typeof window !== 'undefined') {
      expect(_global).toBe(window);
    } else if (typeof global !== 'undefined') {
      expect(_global).toBe(global);
    } else if (typeof self !== 'undefined') {
      expect(_global).toBe(self);
    } else {
      expect(_global).toEqual({});
    }
  });
});

const getDescriptor = (key: 'window' | 'global' | 'self') =>
  Object.getOwnPropertyDescriptor(globalThis, key);

const restoreGlobalKey = (
  key: 'window' | 'global' | 'self',
  descriptor?: PropertyDescriptor
) => {
  if (!descriptor) {
    delete (globalThis as any)[key];
    return;
  }
  Object.defineProperty(globalThis, key, descriptor);
};

describe('getGlobal environment branches', () => {
  test('falls back to global when window is unavailable', () => {
    const windowDescriptor = getDescriptor('window');
    const globalDescriptor = getDescriptor('global');
    const selfDescriptor = getDescriptor('self');
    const globalRef = {
      marker: 'global'
    };
    try {
      delete (globalThis as any).window;
      Object.defineProperty(globalThis, 'global', {
        value: globalRef,
        configurable: true,
        writable: true
      });
      delete (globalThis as any).self;
      expect(getGlobal()).toBe(globalRef);
    } finally {
      restoreGlobalKey('window', windowDescriptor);
      restoreGlobalKey('global', globalDescriptor);
      restoreGlobalKey('self', selfDescriptor);
    }
  });

  test('falls back to self when window/global are unavailable', () => {
    const windowDescriptor = getDescriptor('window');
    const globalDescriptor = getDescriptor('global');
    const selfDescriptor = getDescriptor('self');
    const selfRef = {
      marker: 'self'
    };
    try {
      delete (globalThis as any).window;
      delete (globalThis as any).global;
      Object.defineProperty(globalThis, 'self', {
        value: selfRef,
        configurable: true,
        writable: true
      });
      expect(getGlobal()).toBe(selfRef);
    } finally {
      restoreGlobalKey('window', windowDescriptor);
      restoreGlobalKey('global', globalDescriptor);
      restoreGlobalKey('self', selfDescriptor);
    }
  });

  test('falls back to empty object when no global targets exist', () => {
    const windowDescriptor = getDescriptor('window');
    const globalDescriptor = getDescriptor('global');
    const selfDescriptor = getDescriptor('self');
    try {
      delete (globalThis as any).window;
      delete (globalThis as any).global;
      delete (globalThis as any).self;
      expect(getGlobal()).toEqual({});
    } finally {
      restoreGlobalKey('window', windowDescriptor);
      restoreGlobalKey('global', globalDescriptor);
      restoreGlobalKey('self', selfDescriptor);
    }
  });
});
