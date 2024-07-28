import { create } from '../src';

test('base', () => {
  const store = create((store) => ({
    name: 'test',
    count: 0,
    increment() {
      store.setState((draft) => {
        draft.count += 1;
      });
    }
  }));
  expect(store.getState()).toMatchInlineSnapshot(`
{
  "count": 0,
  "increment": [Function],
  "name": "test",
}
`);
  const fn = jest.fn();
  store.subscribe(fn);
  store.getState().increment();
  expect(store.getState()).toMatchInlineSnapshot(`
{
  "count": 1,
  "increment": [Function],
  "name": "test",
}
`);
});
