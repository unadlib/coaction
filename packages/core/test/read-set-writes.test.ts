import { create } from '../src';
import { derive, derivePath } from '../src/derived';
import { onStoreCommit } from '../src/storeCommit';
import { applyPatches } from '../src/utils';

test('small read sets observe sparse-array existence, length and prototype changes', () => {
  const store = create({ rows: new Array<undefined>(1), record: { n: 1 } });
  const length = derivePath(store, ['rows', 'length']);
  const present = derive(store, (s) => 0 in s.rows, { deep: true });
  const inherited = derive(store, (s) => 'toString' in s.record, {
    deep: true
  });
  expect([length(), present(), inherited()]).toEqual([1, false, true]);
  store.setState({
    rows: [undefined],
    record: Object.assign(Object.create(null), { n: 1 })
  });
  expect([length(), present(), inherited()]).toEqual([1, true, false]);
  store.setState({ rows: [] });
  expect([length(), present()]).toEqual([0, false]);
  length.dispose();
  present.dispose();
  inherited.dispose();
  store.destroy();
});

test('small read sets preserve atomic identities, cycles and alias changes', () => {
  type Node = { n: number; self?: Node };
  const first: Node = { n: 1 };
  first.self = first;
  const store = create({ a: first, b: first, date: new Date(0) });
  const read = derive(
    store,
    (s) => [s.a.self === s.a, s.a === s.b, s.date.getTime()],
    { deep: true }
  );
  expect(read()).toEqual([true, true, 0]);
  const next: Node = { n: 2 };
  next.self = { n: 2 };
  store.setState({ a: next, b: { n: 2 }, date: new Date(1) });
  expect(read()).toEqual([false, false, 1]);
  read.dispose();
  store.destroy();
});

test('writes stay exact as the read set grows and a commit journal attaches and detaches', () => {
  const values = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`v${i}`, 0])
  );
  const store = create(values);
  const readers = Object.keys(values).map((key) => derivePath(store, [key]));
  readers[0]();
  store.setState((s) => {
    s.v0 = -0;
    s.v1++;
  });
  expect(Object.is(readers[0](), -0)).toBe(true);
  readers.forEach((read) => read());
  store.setState((s) => {
    s.v0 = 0;
    s.v1++;
  });
  expect(Object.is(readers[0](), 0)).toBe(true);
  let replayed = store.getPureState();
  const stop = onStoreCommit(store, (commit) => {
    replayed = applyPatches(replayed, commit.patches);
    expect(replayed).toEqual(commit.state);
  });
  store.setState((s) => {
    s.v0 = -0;
    s.v2++;
  });
  stop();
  readers.slice(1).forEach((read) => read.dispose());
  store.setState((s) => {
    s.v0 = 0;
    s.v2++;
  });
  expect(Object.is(readers[0](), 0)).toBe(true);
  readers[0].dispose();
  store.destroy();
});
