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
