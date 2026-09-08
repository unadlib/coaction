import { computed, create, effect, signal } from '../index';
import { derive, derivePath, identity, type Derived } from 'coaction/derived';
import { createStore } from '../src/storeFactory';
import type { ReactivePathNode } from '../src/reactivePath';

const countNodes = (node?: ReactivePathNode): number =>
  node
    ? 1 +
      [...(node.children?.values() ?? [])].reduce(
        (sum, child) => sum + countNodes(child),
        0
      )
    : 0;

test('deep selection skips sibling leaves while default selection preserves identity', () => {
  const store = create({ user: { name: 'Ada', age: 30 } });
  const captured = store.getState().user;
  let calls = 0;
  const name = derive(
    store,
    (s) => {
      calls++;
      return s.user.name;
    },
    { deep: true }
  );
  const same = derive(store, (s) => `${s.user === captured}:${s.user.name}`);
  const marked = derive(
    store,
    (s) => `${identity(s.user) === captured}:${s.user.name}`,
    { deep: true }
  );
  expect(name()).toBe('Ada');
  expect(name()).toBe('Ada');
  expect(same()).toBe('true:Ada');
  expect(marked()).toBe('true:Ada');
  store.setState((s) => {
    s.user.age++;
  });
  expect(name()).toBe('Ada');
  expect(calls).toBe(1);
  expect(same()).toBe('false:Ada');
  expect(marked()).toBe('false:Ada');
  store.setState((s) => {
    s.user.name = 'Lin';
  });
  expect(name()).toBe('Lin');
  expect(calls).toBe(2);
  store.destroy();
});

test('deep output wrappers retain terminal state objects alongside leaf reads', () => {
  const store = create({ user: { name: 'Ada', age: 30 }, n: 0 });
  const wrapped = derive(
    store,
    (s) => ({ nested: [s.user], name: s.user.name }),
    { deep: true }
  );
  expect(wrapped().nested[0]).toBe(store.getState().user);
  const before = wrapped();
  store.setState((s) => {
    s.user.age++;
  });
  expect(wrapped()).not.toBe(before);
  expect(wrapped().nested[0].age).toBe(31);
  expect(() => {
    wrapped().nested[0].age++;
  }).toThrow('Direct state mutation');
  store.destroy();
});

test('same output wrappers carrying live root facades still propagate changes', () => {
  const store = create({ n: 1 });
  const wrapper = { root: store.getState(), cycle: null as any };
  wrapper.cycle = wrapper;
  const result = derive(store, () => wrapper, { deep: true });
  let notifications = 0;
  const stop = effect(() => {
    result();
    notifications++;
  });
  store.setState({ n: 2 });
  expect(result()).toBe(wrapper);
  expect(notifications).toBe(2);
  expect(result().root.n).toBe(2);
  stop();
  store.destroy();
});

test('opaque output identity can be marked without invoking getters', () => {
  const store = create({ user: { name: 'Ada', age: 1 } });
  let outputGetterCalls = 0;
  const result = derive(
    store,
    (s) => {
      const user = identity(s.user);
      return {
        name: user.name,
        get age() {
          outputGetterCalls++;
          return user.age;
        }
      };
    },
    { deep: true }
  );
  expect(result().name).toBe('Ada');
  expect(outputGetterCalls).toBe(0);
  store.setState((s) => {
    s.user.age++;
  });
  expect(result().age).toBe(2);
  expect(outputGetterCalls).toBe(1);
  expect(identity(3)).toBe(3);
  store.destroy();
});

test('deep tracking observes missing keys, has, own keys and sparse array structure', () => {
  const store = create({
    dict: {} as Record<string, number>,
    rows: new Array<number>(2)
  });
  const result = derive(
    store,
    (s) =>
      `${s.dict.x}:${'x' in s.dict}:${Object.keys(s.dict)}:${0 in s.rows}:${s.rows.length}:${s.rows[1]}`,
    { deep: true }
  );
  expect(result()).toBe('undefined:false::false:2:undefined');
  store.setState({ dict: { x: 3 }, rows: [1, 2] });
  expect(result()).toBe('3:true:x:true:2:2');
  store.setState((s) => {
    delete s.dict.x;
    s.rows.shift();
  });
  expect(result()).toBe('undefined:false::true:1:undefined');
  store.destroy();
});

test('dynamic branches reclaim 100000 inactive dictionary dependencies', () => {
  const { store, internal } = createStore(
    {
      rows: Object.fromEntries(
        Array.from({ length: 100000 }, (_, i) => [i, { n: i }])
      )
    },
    {}
  );
  const key = signal(0);
  const selected = derive(store, (s) => s.rows[key()].n, { deep: true });
  for (let i = 0; i < 100000; i++) {
    key(i);
    if (selected() !== i) throw new Error(`stale at ${i}`);
  }
  expect(countNodes(internal.reactivePathRoot)).toBe(4);
  expect(internal.reactivePathActiveCount).toBe(1);
  selected.dispose();
  expect(countNodes(internal.reactivePathRoot)).toBe(1);
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
}, 15000);

test('inactive branches stop invalidating and disposed selectors release patch generation', () => {
  let patches = 0;
  const { store, internal } = createStore(
    { left: { n: 1 }, right: { n: 2 } },
    {
      middlewares: [
        (s) => {
          s.patch = (transition) => {
            patches++;
            return transition;
          };
          return s;
        }
      ]
    }
  );
  const left = signal(true);
  let calls = 0;
  const result = derive(
    store,
    (s) => {
      calls++;
      return (left() ? s.left : s.right).n;
    },
    { deep: true }
  );
  store.setState((s) => {
    s.right.n++;
  });
  expect(patches).toBe(0);
  expect(result()).toBe(1);
  left(false);
  expect(result()).toBe(3);
  store.setState((s) => {
    s.left.n++;
  });
  expect(result()).toBe(3);
  expect(calls).toBe(2);
  expect(patches).toBe(1);
  result.dispose();
  store.setState((s) => {
    s.right.n++;
  });
  expect(patches).toBe(1);
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test('derived chains publish one consistent committed version', () => {
  const store = create({ x: 1, y: 2 });
  const x = derivePath(store, ['x']);
  const sum = derive(store, (s) => x() + s.y, { deep: true });
  const diamond = derive(store, (s) => `${x()}:${sum()}:${s.x}:${s.y}`, {
    deep: true
  });
  const values: string[] = [];
  const stop = effect(() => {
    values.push(diamond());
  });
  store.setState((s) => {
    s.x = 3;
    s.y = 4;
    expect(diamond()).toBe('3:7:3:4');
    expect(values).toEqual(['1:3:1:2']);
  });
  expect(values).toEqual(['1:3:1:2', '3:7:3:4']);
  stop();
  store.destroy();
});

test('a failed draft does not retain revoked proxies or change dependency branches', () => {
  const { store, internal } = createStore(
    { left: true, a: { n: 1 }, b: { n: 2 } },
    {}
  );
  let calls = 0;
  const result = derive(
    store,
    (s) => {
      calls++;
      return s.left ? s.a : s.b;
    },
    { deep: true }
  );
  const before = result();
  const count = internal.reactivePathActiveCount;
  expect(() =>
    store.setState((s) => {
      s.left = false;
      s.b.n = 9;
      expect(result().n).toBe(9);
      throw new Error('rollback');
    })
  ).toThrow('rollback');
  expect(result()).toBe(before);
  expect(result().n).toBe(1);
  expect(internal.reactivePathActiveCount).toBe(count);
  store.setState((s) => {
    s.b.n++;
  });
  expect(result()).toBe(before);
  expect(calls).toBe(2);
  store.destroy();
});

test('errors remain errors on cached reads and recover when inputs change', () => {
  const { store, internal } = createStore({ n: 0 }, {});
  const result = derive(
    store,
    (s) => {
      if (!s.n) throw new Error('zero');
      return s.n * 2;
    },
    { deep: true }
  );
  const values: Array<number | string> = [];
  const stop = effect(() => {
    try {
      values.push(result());
    } catch (e) {
      values.push((e as Error).message);
    }
  });
  expect(() => result()).toThrow('zero');
  expect(() => result()).toThrow('zero');
  store.setState({ n: 1 });
  expect(result()).toBe(2);
  store.setState({ n: 0 });
  expect(() => result()).toThrow('zero');
  store.setState({ n: 2 });
  expect(values).toEqual(['zero', 2, 'zero', 4]);
  stop();
  result.dispose();
  expect(internal.reactivePathActiveCount).toBe(0);
  store.destroy();
});

test('recursive derived reads fail without overflowing or poisoning other selectors', () => {
  const store = create({ n: 1 });
  let recursive: Derived<number>;
  recursive = derive(store, (s) => s.n + recursive(), { deep: true });
  expect(() => recursive()).toThrow('Circular derived');
  expect(() => recursive()).toThrow('Circular derived');
  const next = derive(store, (s) => s.n, { deep: true });
  expect(next()).toBe(1);
  store.setState({ n: 2 });
  expect(next()).toBe(2);
  store.destroy();
});

test('native getters keep frozen snapshots when composed with deep derivations', () => {
  let name: Derived<string>;
  const store = create<{
    user: { name: string; age: number };
    readonly label: string;
  }>(() => ({
    user: { name: 'Ada', age: 1 },
    get label() {
      const selected = name();
      expect(Object.isFrozen(this.user)).toBe(true);
      return `${selected}:${this.user.age}`;
    }
  }));
  name = derive(store, (s) => s.user.name, { deep: true });
  const combined = computed(() => store.getState().label);
  expect(combined()).toBe('Ada:1');
  store.setState((s) => {
    s.user.age++;
  });
  expect(combined()).toBe('Ada:2');
  store.destroy();
});

test('same primitive results suppress effects while fresh object outputs propagate', () => {
  const store = create({ n: 0 });
  const parity = derive(store, (s) => s.n % 2);
  const object = derive(store, (s) => ({ parity: s.n % 2 }));
  let primitives = 0;
  let objects = 0;
  const stopA = effect(() => {
    parity();
    primitives++;
  });
  const stopB = effect(() => {
    object();
    objects++;
  });
  store.setState({ n: 2 });
  expect(primitives).toBe(1);
  expect(objects).toBe(2);
  stopA();
  stopB();
  store.destroy();
});

test('deep graph selection preserves cycles, shared references, prototypes and atomic identities', () => {
  const graph = (n: number) => {
    const node = Object.assign(Object.create(null), { n, self: null });
    node.self = node;
    return { node, alias: node, date: new Date(n), map: new Map([[n, n]]) };
  };
  const store = create({ graph: graph(1) });
  const result = derive(
    store,
    (s) => {
      const { node, alias, date, map } = s.graph;
      return {
        same: identity(node) === identity(alias),
        self: identity(node.self) === identity(node),
        proto: Object.getPrototypeOf(node),
        n: node.n,
        date,
        map
      };
    },
    { deep: true }
  );
  for (let i = 1; i < 20; i++) {
    if (i > 1) store.setState({ graph: graph(i) });
    expect(result()).toMatchObject({
      same: true,
      self: true,
      proto: null,
      n: i
    });
    expect(result().date).toBe(store.getState().graph.date);
    expect(result().map).toBe(store.getState().graph.map);
  }
  store.destroy();
});
