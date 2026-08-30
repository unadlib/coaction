import { vi } from 'vitest';
import {
  areShallowEqualWithArray,
  cloneOwnEnumerable,
  shallowCloneOwnEnumerable,
  mergeObject,
  replaceOwnEnumerable,
  sanitizePatches,
  uuid
} from '../src/utils';

test('areShallowEqualWithArray handles null, NaN and signed zero', () => {
  expect(areShallowEqualWithArray(null, [1] as any)).toBeFalsy();
  expect(areShallowEqualWithArray([NaN], [NaN])).toBeTruthy();
  expect(areShallowEqualWithArray([0], [-0])).toBeFalsy();
});

test('mergeObject handles slice and plain merge paths', () => {
  const target = {
    user: {
      name: 'coaction'
    },
    count: 1
  };
  mergeObject(
    target,
    {
      user: {
        name: 'next'
      },
      count: 2
    },
    true
  );
  expect(target).toEqual({
    user: {
      name: 'next'
    },
    count: 1
  });

  mergeObject(target, null as any, true);
  expect(target.count).toBe(1);

  mergeObject(target, {
    count: 3
  });
  expect(target.count).toBe(3);
});

test('mergeObject ignores unknown and inherited slice keys', () => {
  const proto = {
    inherited: {
      name: 'bad'
    }
  };
  const source = Object.create(proto) as {
    user: {
      name: string;
    };
    unknown: {
      value: number;
    };
  };
  source.user = {
    name: 'next'
  };
  source.unknown = {
    value: 1
  };
  const target = {
    user: {
      name: 'coaction'
    }
  };

  expect(() => {
    mergeObject(target, source, true);
  }).not.toThrow();
  expect(target).toEqual({
    user: {
      name: 'next'
    }
  });
  expect((target as any).inherited).toBeUndefined();
  expect((target as any).unknown).toBeUndefined();
});

test('mergeObject copies enumerable symbol keys and skips non-enumerable keys', () => {
  const token = Symbol('token');
  const hidden = Symbol('hidden');
  const target = {} as Record<PropertyKey, unknown>;
  const source = {
    [token]: 1
  } as Record<PropertyKey, unknown>;
  Object.defineProperty(source, hidden, {
    value: 2,
    enumerable: false
  });

  mergeObject(target, source);

  expect(target[token]).toBe(1);
  expect(target[hidden]).toBeUndefined();

  const nestedToken = Symbol('nested-token');
  const nestedHidden = Symbol('nested-hidden');
  const sliceTarget = {
    user: {
      [nestedToken]: 1
    } as Record<PropertyKey, unknown>
  };
  const sliceSource = {
    user: {
      [nestedToken]: 2
    } as Record<PropertyKey, unknown>
  };
  Object.defineProperty(sliceSource.user, nestedHidden, {
    value: 3,
    enumerable: false
  });

  mergeObject(sliceTarget, sliceSource, true);

  expect(sliceTarget.user[nestedToken]).toBe(2);
  expect(sliceTarget.user[nestedHidden]).toBeUndefined();
});

test('replaceOwnEnumerable replaces data keys without copying functions or unsafe keys', () => {
  const token = Symbol('token');
  const target = {
    stale: true,
    keep: 1
  } as Record<PropertyKey, unknown>;
  const source = JSON.parse(
    '{"keep":2,"nested":{"value":3,"__proto__":{"nested":true},"constructor":{"value":4}},"__proto__":{"polluted":true}}'
  ) as Record<PropertyKey, unknown>;
  source[token] = 3;
  source.action = () => undefined;

  replaceOwnEnumerable(target, source);

  expect(target.keep).toBe(2);
  expect(target.nested).toEqual({
    value: 3
  });
  expect(Object.getPrototypeOf(target.nested)).toBe(Object.prototype);
  expect(target[token]).toBe(3);
  expect(target.stale).toBeUndefined();
  expect(target.action).toBeUndefined();
  expect((target as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(target.nested, '__proto__')).toBe(
    false
  );
  expect(
    Object.prototype.hasOwnProperty.call(target.nested, 'constructor')
  ).toBe(false);
});

test('replaceOwnEnumerable preserves root cycles and shared references', () => {
  const target = {
    stale: true
  } as Record<PropertyKey, unknown>;
  const source = {
    count: 1,
    nested: {
      value: 2
    }
  } as Record<PropertyKey, unknown>;
  source.self = source;
  source.left = source.nested;
  source.right = source.nested;

  replaceOwnEnumerable(target, source);

  expect(target.stale).toBeUndefined();
  expect(target.count).toBe(1);
  expect(target.self).toBe(target);
  expect(target.left).toBe(target.right);
  expect(target.left).not.toBe(source.nested);
  expect(target.left).toEqual({
    value: 2
  });
});

test('sanitizePatches warns about dropped unsafe paths in development', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  process.env.NODE_ENV = 'development';
  try {
    const patches = sanitizePatches(
      [
        {
          op: 'replace',
          path: ['__proto__', 'polluted'],
          value: true
        },
        {
          op: 'replace',
          path: ['count'],
          value: 1
        }
      ],
      {
        source: 'test patch source',
        warnOnDropped: true
      }
    );

    expect(patches).toEqual([
      {
        op: 'replace',
        path: ['count'],
        value: 1
      }
    ]);
    expect(warn).toHaveBeenCalledWith(
      "Coaction dropped unsafe patch path '__proto__.polluted' from test patch source."
    );
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    warn.mockRestore();
  }
});

test('shallowCloneOwnEnumerable keeps nested identity and skips unsafe keys', () => {
  const nested = { value: 2 };
  const source = {
    count: 1,
    nested
  } as Record<PropertyKey, unknown>;
  Object.defineProperty(source, '__proto__', {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
    writable: true
  });

  const clone = shallowCloneOwnEnumerable(source);

  expect(clone).not.toBe(source);
  expect(clone.count).toBe(1);
  // Nested values keep identity: this is what makes the copy O(own keys).
  expect(clone.nested).toBe(nested);
  expect(Object.prototype.hasOwnProperty.call(clone, '__proto__')).toBe(false);
  expect(
    (Object.prototype as Record<string, unknown>).polluted
  ).toBeUndefined();
});

test('cloneOwnEnumerable preserves root cycles and shared references', () => {
  const source = {
    count: 1,
    nested: {
      value: 2
    }
  } as Record<PropertyKey, unknown>;
  source.self = source;
  source.left = source.nested;
  source.right = source.nested;

  const clone = cloneOwnEnumerable(source);

  expect(clone.count).toBe(1);
  expect(clone.self).toBe(clone);
  expect(clone.left).toBe(clone.right);
  expect(clone.left).not.toBe(source.nested);
  expect(clone.left).toEqual({
    value: 2
  });
});

test('mergeObject ignores unsafe prototype keys', () => {
  const pollutedKey = '__coactionPolluted__';
  const objectPrototype = Object.prototype as Record<string, unknown>;
  delete objectPrototype[pollutedKey];

  try {
    const plainTarget = {
      count: 1
    };
    const plainSource = JSON.parse(
      '{"__proto__":{"polluted":true},"count":2,"nested":{"value":1,"__proto__":{"nested":true},"constructor":{"value":2}}}'
    ) as Record<string, unknown>;

    mergeObject(plainTarget, plainSource);
    expect(plainTarget).toEqual({
      count: 2,
      nested: {
        value: 1
      }
    });
    expect(Object.getPrototypeOf(plainTarget)).toBe(Object.prototype);
    expect(Object.getPrototypeOf((plainTarget as any).nested)).toBe(
      Object.prototype
    );
    expect((plainTarget as Record<string, unknown>).polluted).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(
        (plainTarget as any).nested,
        '__proto__'
      )
    ).toBe(false);

    const sliceTarget = {
      nested: {
        value: 1
      }
    };
    const sliceSource = {
      nested: JSON.parse(
        `{"value":2,"__proto__":{"${pollutedKey}":true},"constructor":{"value":3}}`
      ) as Record<string, unknown>
    };

    mergeObject(sliceTarget, sliceSource, true);
    expect(sliceTarget).toEqual({
      nested: {
        value: 2
      }
    });
    expect(Object.getPrototypeOf(sliceTarget.nested)).toBe(Object.prototype);
    expect(
      Object.prototype.hasOwnProperty.call(sliceTarget.nested, '__proto__')
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(sliceTarget.nested, 'constructor')
    ).toBe(false);
    expect(objectPrototype[pollutedKey]).toBeUndefined();
  } finally {
    delete objectPrototype[pollutedKey];
  }
});

test('uuid returns v4-like identifier', () => {
  const value = uuid();
  expect(value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});
