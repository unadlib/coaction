import { areShallowEqualWithArray, mergeObject, uuid } from '../src/utils';

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

test('uuid returns v4-like identifier', () => {
  const value = uuid();
  expect(value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});
