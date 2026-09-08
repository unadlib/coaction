import { create } from '../index';
import { create as createShared } from 'coaction/shared';
import { derive, derivePath } from 'coaction/derived';
import { onStoreCommit } from 'coaction/adapter';
import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { vi, expectTypeOf } from 'vitest';
import { create as createZustand } from 'zustand';
import { adapt, bindZustand } from '../../coaction-zustand/src';
import { makeAutoObservable } from 'mobx';
import { bindMobx } from '../../coaction-mobx/src';

test('external runtimes require their own derived implementations', () => {
  const immutable = create(() =>
    adapt(createZustand(bindZustand(() => ({ n: 1 }))))
  );
  const mutable = create(() => makeAutoObservable(bindMobx({ n: 1 })));
  for (const store of [immutable, mutable]) {
    expect(() => derive(store, (s) => s.n)).toThrow('native immutable');
    expect(() => derivePath(store, ['n'])).toThrow('native immutable');
    store.destroy();
  }
});

test('derived values read the committed middleware transformation', () => {
  const store = create(
    { n: 1 },
    {
      middlewares: [
        (s) => {
          s.patch = (transition) => ({
            ...transition,
            patches: transition.patches.map((p) =>
              p.op === 'replace' && p.path[0] === 'n' ? { ...p, value: 10 } : p
            )
          });
          return s;
        }
      ]
    }
  );
  const n = derivePath(store, ['n']);
  expect(n()).toBe(1);
  store.setState({ n: 2 });
  expect(n()).toBe(10);
  store.destroy();
});

test('paths and automatic selectors support native slices and getter composition', () => {
  const store = create(
    {
      counter: () => ({
        user: { n: 1 },
        get double(): number {
          return this.user.n * 2;
        }
      }),
      other: () => ({ value: 0 })
    },
    { sliceMode: 'slices' }
  );
  const n = derivePath(store, ['counter', 'user', 'n']);
  const doubled = derive(store, (s) => s.counter.double, { deep: true });
  expectTypeOf(n()).toEqualTypeOf<number>();
  expectTypeOf(doubled()).toEqualTypeOf<number>();
  expect(doubled()).toBe(2);
  store.setState((s) => {
    s.counter.user.n++;
  });
  expect(n()).toBe(2);
  expect(doubled()).toBe(4);
  store.destroy();
});

test('shared clients recompute derivations from their accepted mirror commits', async () => {
  const ports = mockPorts();
  const serverTransport = createTransport('WebWorkerInternal', ports.main);
  const clientTransport = createTransport(
    'WebWorkerClient',
    ports.create() as WorkerMainTransportOptions
  );
  const state = () => ({ user: { n: 0 } });
  const server = createShared(state, {
    name: 'derived-mirror',
    transport: serverTransport
  });
  server.setState({ user: { n: 3 } });
  const client = createShared(state, {
    name: 'derived-mirror',
    clientTransport
  });
  const local = derive(server, (s) => s.user.n * 2, { deep: true });
  const remote = derive(client, (s) => s.user.n * 2, { deep: true });
  const path = derivePath(client, ['user', 'n']);
  try {
    await vi.waitFor(() => expect(remote()).toBe(6));
    const commits: unknown[] = [];
    onStoreCommit(server, (commit) => {
      commits.push(commit.patches);
    });
    server.setState((s) => {
      s.user.n++;
    });
    await vi.waitFor(() => {
      expect(remote()).toBe(8);
      expect(path()).toBe(4);
    });
    expect(local()).toBe(8);
    expect(Object.keys(server.getPureState())).toEqual(['user']);
    expect(JSON.stringify(commits)).not.toContain('derived');
  } finally {
    client.destroy();
    server.destroy();
  }
  expect(() => remote()).toThrow('disposed');
});
