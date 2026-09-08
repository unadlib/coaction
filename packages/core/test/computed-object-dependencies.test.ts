import { computed, create, effect } from '../index';

test('standalone computed retains a terminal readonly object dependency', () => {
  const store = create({ user: { name: 'Ada', age: 30 } });
  const user = computed(() => store.getState().user);
  const before = user();
  store.setState((state) => {
    state.user.age++;
  });
  expect(user()).toBe(store.getState().user);
  expect(user()).not.toBe(before);
  expect(before.age).toBe(30);
  store.destroy();
});

test('standalone computed conservatively observes object identity alongside leaves', () => {
  const store = create({ user: { name: 'Ada', age: 30 } });
  const captured = store.getState().user;
  const identity = computed(() => {
    const user = store.getState().user;
    return `${user === captured}:${user.name}`;
  });
  const observed: string[] = [];
  const stop = effect(() => {
    observed.push(identity());
  });
  store.setState((state) => {
    state.user.age++;
  });
  expect(observed).toEqual(['true:Ada', 'false:Ada']);
  stop();
  store.destroy();
});

test('standalone computed updates state objects carried in output wrappers', () => {
  const store = create({ rows: [{ label: 'a', count: 0 }] });
  const result = computed(() => {
    const row = store.getState().rows[0];
    return { row, label: row.label };
  });
  expect(result().row.count).toBe(0);
  store.setState((state) => {
    state.rows[0].count++;
  });
  expect(result().row.count).toBe(1);
  expect(result().label).toBe('a');
  store.destroy();
});
