import { create } from '../index';
import {
  applyPatches,
  onStoreCommit,
  type StoreCommit
} from 'coaction/adapter';
import { forEachSeed, type Random } from './random';

// An adjacency list is an independent oracle: equal leaf values with different
// sharing or cycles have different node numbers. No production comparator or
// JSON serialization is involved, and atomic leaves retain their identities.
const graphRecorder = () => {
  const atoms = new WeakMap<object, number>();
  let atomicId = 0;
  return (root: unknown) => {
    const ids = new Map<object, number>();
    const queue: object[] = [];
    const reference = (value: unknown): unknown => {
      if (typeof value !== 'object' || value === null) return ['value', value];
      const prototype = Object.getPrototypeOf(value);
      if (
        !Array.isArray(value) &&
        prototype !== null &&
        prototype !== Object.prototype
      ) {
        if (!atoms.has(value)) atoms.set(value, atomicId++);
        return ['atomic', atoms.get(value)];
      }
      if (!ids.has(value)) {
        ids.set(value, queue.length);
        queue.push(value);
      }
      return ['node', ids.get(value)];
    };
    const entry = reference(root);
    const nodes: unknown[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index] as Record<PropertyKey, unknown>;
      const shape = Array.isArray(node)
        ? ['array', node.length]
        : [Object.getPrototypeOf(node) === null ? 'null-prototype' : 'object'];
      nodes.push([
        shape,
        Reflect.ownKeys(node)
          .filter((key) =>
            Object.prototype.propertyIsEnumerable.call(node, key)
          )
          .map((key) => [key, reference(node[key])])
      ]);
    }
    return [entry, nodes];
  };
};

const graph = (random: Random) => {
  const nodes = random.list(
    2,
    8,
    (index) => ({ value: index }) as Record<PropertyKey, unknown>
  );
  for (const node of nodes) {
    node.next = random.pick(nodes);
    node.other = random.pick(nodes);
  }
  const sparse: unknown[] = Array(random.integer(1, 5));
  sparse[sparse.length - 1] = random.pick(nodes);
  const record = Object.assign(Object.create(null), {
    node: random.pick(nodes)
  });
  return {
    nodes,
    sparse,
    record,
    stamp: new Date(random.integer(0, 10000)),
    map: new Map([['value', random.integer(0, 100)]]),
    [Symbol('edge')]: random.pick(nodes)
  };
};

// Generate complete replacement values. Creating cycles from draft references
// or editing inside a cyclic draft is outside the supported recipe contract.
test('observation and commit replay preserve complete local graph replacements', () => {
  forEachSeed(100, (random) => {
    const initial = random.chance(0.5) ? graph(random) : null;
    const next = random.chance(0.8) ? graph(random) : null;
    for (const mode of ['recipe', 'object', 'replacement', 'patch'] as const) {
      const record = graphRecorder();
      let expected: unknown;
      for (const watched of [false, true]) {
        const store = create<{ graph: unknown; count: number }>(() => ({
          graph: initial,
          count: 0
        }));
        const before = store.getPureState();
        const initialGraph = record(before);
        const commits: StoreCommit[] = [];
        if (watched) onStoreCommit(store, (commit) => commits.push(commit));
        if (mode === 'recipe') {
          store.setState((draft) => {
            draft.graph = next;
            draft.count += 1;
          });
        } else if (mode === 'object') {
          store.setState({ graph: next, count: 1 });
        } else if (mode === 'replacement') {
          store.apply({ graph: next, count: 1 });
        } else {
          store.apply(before, [
            { op: 'replace', path: ['graph'], value: next },
            { op: 'replace', path: ['count'], value: 1 }
          ]);
        }
        expect(record(before)).toStrictEqual(initialGraph);
        const after = record(store.getPureState());
        expect(after).toStrictEqual(record({ graph: next, count: 1 }));
        if (!watched) expected = after;
        else {
          expect(after).toStrictEqual(expected);
          expect(commits).toHaveLength(1);
          expect(
            record(applyPatches(before, commits[0].patches))
          ).toStrictEqual(after);
          expect(
            record(
              applyPatches(store.getPureState(), commits[0].inversePatches)
            )
          ).toStrictEqual(initialGraph);
        }
        store.destroy();
      }
    }
  });
}, 600000);
