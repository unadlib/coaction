import { vi } from 'vitest';
import { create } from 'coaction';
import {
  getSyncApi,
  sync,
  type SyncAdapter,
  type SyncPullResult,
  type SyncStorage
} from '../src';

const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const memory = () => {
  const values = new Map<string, string>();
  const storage: SyncStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    }
  };
  return { values, storage };
};
const cycle: Record<string, unknown> = {};
cycle.self = cycle;
const invalid: Array<[string, unknown]> = [
  ...[
    new Date(0),
    Infinity,
    -Infinity,
    NaN,
    undefined,
    new Map(),
    /x/,
    cycle,
    Array(2),
    { fn() {} },
    { [Symbol()]: 1 }
  ].map((value, i): [string, unknown] => [
    `payload ${i}`,
    { patches: [{ op: 'replace', path: ['value'], value }] }
  ]),
  ['cursor', { cursor: 42 }],
  ['revision', { revision: null }],
  ['null', null],
  ['array', []],
  ['string', 'invalid'],
  [
    'path number',
    { patches: [{ op: 'replace', path: ['value', NaN], value: 2 }] }
  ],
  ['path pointer', { patches: [{ op: 'replace', path: 'value', value: 2 }] }],
  ['path escape', { patches: [{ op: 'replace', path: '/value~x', value: 2 }] }]
];

describe.each(['pull', 'subscription'] as const)('%s validation', (via) => {
  test.each(invalid)(
    'rejects %s before state, metadata, adapter or storage changes',
    async (_, result) => {
      const { storage, values } = memory();
      const errors: unknown[] = [];
      let emit!: (result: SyncPullResult) => void;
      const accept = vi.fn();
      const store = create(
        { value: 0 },
        {
          middlewares: [
            sync({
              name: 'remote-validation',
              storage,
              adapter: {
                pull: async () => result as SyncPullResult,
                push: async () => ({}),
                accept,
                subscribe: (listener) => {
                  emit = listener;
                }
              },
              retry: { initialMs: 100000 },
              onError: (error) => {
                errors.push(error);
              }
            })
          ]
        }
      );
      const api = getSyncApi(store);
      await api.flush();
      await tick();
      const before = values.get('remote-validation');
      if (via === 'pull') await expect(api.pull()).rejects.toThrow(TypeError);
      else {
        emit(result as SyncPullResult);
        await tick();
      }
      expect(errors.length).toBeGreaterThan(0);
      expect(store.getPureState()).toEqual({ value: 0 });
      expect(api.getPending()).toEqual([]);
      expect(accept).not.toHaveBeenCalled();
      expect(values.get('remote-validation')).toBe(before);
      store.destroy();
    }
  );
});

test.each([
  [
    'non-JSON value',
    { patches: [{ op: 'replace', path: ['value'], value: Infinity }] }
  ],
  ['invalid cursor', { cursor: 42 }],
  [
    'invalid patch target',
    { patches: [{ op: 'replace', path: ['missing', 'value'], value: 2 }] }
  ],
  ['invalid ack', { ack: 'wrong' }],
  ['unknown ack', { ack: ['not-submitted'] }]
])('push %s cannot acknowledge pending writes', async (kind, response) => {
  const { storage } = memory();
  let answer!: (value: unknown) => void;
  const accept = vi.fn();
  const adapter: SyncAdapter = {
    pull: async () => ({}),
    push: async () =>
      (await new Promise<unknown>((resolve) => {
        answer = resolve;
      })) as never,
    accept
  };
  const store = create(
    { value: 0 },
    {
      middlewares: [
        sync({
          name: 'invalid-push',
          storage,
          adapter,
          retry: { initialMs: 100000 }
        })
      ]
    }
  );
  const api = getSyncApi(store);
  await api.flush();
  store.setState({ value: 1 });
  const pending = api.getPending();
  const flush = api.flush();
  await tick();
  answer(response);
  await expect(flush).rejects.toThrow(
    kind === 'invalid patch target'
      ? "Cannot apply patch at 'missing/value'."
      : TypeError
  );
  expect(api.getPending()).toEqual(pending);
  expect(store.getPureState()).toEqual({ value: 1 });
  expect(accept).not.toHaveBeenCalled();
  expect(JSON.parse((await storage.getItem('invalid-push'))!).outbox).toEqual(
    pending
  );
  store.destroy();
});

test('a push cannot acknowledge a local mutation that arrived after submission', async () => {
  let answer!: (value: unknown) => void;
  const store = create(
    { value: 0 },
    {
      middlewares: [
        sync({
          name: 'unsent-ack',
          storage: false,
          adapter: {
            pull: async () => ({}),
            push: async () =>
              (await new Promise<unknown>((resolve) => {
                answer = resolve;
              })) as never
          },
          retry: { initialMs: 100000 }
        })
      ]
    }
  );
  const api = getSyncApi(store);
  await api.flush();
  store.setState({ value: 1 });
  const flush = api.flush();
  await tick();
  store.setState({ value: 2 });
  const pending = api.getPending();
  answer({ ack: [pending[1].id] });
  await expect(flush).rejects.toThrow(/submitted/);
  expect(api.getPending()).toEqual(pending);
  store.destroy();
});

test('subscription results are captured before waiting for the remote lane', async () => {
  let emit!: (result: SyncPullResult) => void;
  const store = create(
    { value: { n: 0 } },
    {
      middlewares: [
        sync({
          name: 'captured-remote',
          storage: false,
          adapter: {
            pull: async () => ({}),
            push: async () => ({}),
            subscribe: (listener) => {
              emit = listener;
            }
          }
        })
      ]
    }
  );
  await getSyncApi(store).flush();
  const value = { n: 1 };
  emit({ patches: [{ op: 'replace', path: ['value'], value }] });
  value.n = 9;
  await tick();
  expect(store.getPureState()).toEqual({ value: { n: 1 } });
  store.destroy();
});

test('JSON numeric overflow in a checkpoint is refused before hydration', async () => {
  const { storage, values } = memory();
  const raw = '{"state":{"value":1e400},"outbox":[],"cursor":"old"}';
  values.set('overflow', raw);
  const hydrate = vi.fn();
  const store = create(
    { value: 0 },
    {
      middlewares: [
        sync({
          name: 'overflow',
          storage,
          adapter: { pull: async () => ({}), push: async () => ({}), hydrate }
        })
      ]
    }
  );
  await expect(getSyncApi(store).flush()).rejects.toThrow(/JSON/);
  expect(store.getPureState()).toEqual({ value: 0 });
  expect(values.get('overflow')).toBe(raw);
  expect(hydrate).not.toHaveBeenCalled();
  store.destroy();
});
