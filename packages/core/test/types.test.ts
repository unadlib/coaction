import { expectTypeOf } from 'vitest';
import type {
  ClientStoreOptions,
  PatchTransform,
  Store,
  StoreOptions,
  StoreTraceEvent,
  AsyncStore
} from '../src';
import { create } from '../src';

test('preserves deprecated public compatibility fields', () => {
  type CounterStore = Store<{ count: number }>;

  expectTypeOf<CounterStore['patch']>().toEqualTypeOf<
    ((option: PatchTransform) => PatchTransform) | undefined
  >();
  expectTypeOf<CounterStore['trace']>().toEqualTypeOf<
    ((options: StoreTraceEvent) => void) | undefined
  >();
  expectTypeOf<StoreOptions<{ count: number }>['workerType']>().toEqualTypeOf<
    'SharedWorkerInternal' | 'WebWorkerInternal' | undefined
  >();
  expectTypeOf<
    ClientStoreOptions<{ count: number }>['workerType']
  >().toEqualTypeOf<'SharedWorkerClient' | 'WebWorkerClient' | undefined>();
  expectTypeOf<
    ClientStoreOptions<{ count: number }>['executeSyncTimeoutMs']
  >().toEqualTypeOf<number | undefined>();
});

test('types object inputs as single stores when not using slices mode', () => {
  const objectStore = create({
    count: 0
  });
  const methodStore = create<{ ping: () => string }>(
    {
      ping() {
        return 'pong';
      }
    },
    {
      sliceMode: 'single'
    }
  );
  const clientMethodStore = create<{ ping: () => string }>(
    {
      ping() {
        return 'pong';
      }
    },
    {
      sliceMode: 'single',
      clientTransport: {
        dispose: () => undefined,
        emit: () => Promise.resolve(undefined),
        listen: () => undefined,
        onConnect: () => undefined
      } as unknown as NonNullable<
        ClientStoreOptions<{ ping: () => string }>['clientTransport']
      >
    }
  );

  type MethodPing = ReturnType<typeof methodStore.getState>['ping'];
  type ClientMethodPing = ReturnType<typeof clientMethodStore.getState>['ping'];

  expectTypeOf(objectStore.getState().count).toEqualTypeOf<number>();
  expectTypeOf<MethodPing>().toEqualTypeOf<() => string>();
  expectTypeOf<ClientMethodPing>().toEqualTypeOf<() => Promise<string>>();
  clientMethodStore.destroy();
});

test('types async client methods with awaited return values', () => {
  type Counter = {
    load: () => Promise<number>;
    nested: {
      load: () => Promise<string>;
    };
  };

  type AsyncCounterState = ReturnType<AsyncStore<Counter>['getState']>;
  type AsyncCounterSlicesState = ReturnType<
    AsyncStore<Counter, true>['getState']
  >;

  expectTypeOf<AsyncCounterState['load']>().toEqualTypeOf<
    () => Promise<number>
  >();
  expectTypeOf<AsyncCounterSlicesState['nested']['load']>().toEqualTypeOf<
    () => Promise<string>
  >();
});

test('types stores without client options as synchronous', () => {
  type Counter = {
    count: number;
    increment: () => void;
  };

  const slice = (set: any) => ({
    count: 0,
    increment() {
      set((state: Counter) => {
        state.count += 1;
      });
    }
  });
  const store = create<Counter>(slice);
  const explicitLocalStore = create<Counter>(slice, {});
  const slicesStore = create({ counter: slice });

  expectTypeOf(store.getState().increment).toEqualTypeOf<() => void>();
  expectTypeOf(explicitLocalStore.getState().increment).toEqualTypeOf<
    () => void
  >();
  expectTypeOf(slicesStore.getState().counter.increment).toEqualTypeOf<
    () => void
  >();

  store.destroy();
  explicitLocalStore.destroy();
  slicesStore.destroy();
});

test('types a possibly-undefined worker as a client store', () => {
  type Counter = {
    count: number;
    increment: () => void;
  };

  const slice = (set: any) => ({
    count: 0,
    increment() {
      set((state: Counter) => {
        state.count += 1;
      });
    }
  });

  // `worker` may legitimately be undefined at runtime; the store must still
  // be typed with the async client contract so call sites are identical in
  // shared mode and in the degraded local fallback.
  const maybeWorker: SharedWorker | undefined = undefined;
  const store = create<Counter>(slice, { worker: maybeWorker });
  const spreadOptions = { worker: maybeWorker };
  const namedSpreadStore = create<Counter>(slice, {
    name: 'named-spread',
    ...spreadOptions
  });
  const trailingNameStore = create<Counter>(slice, {
    ...spreadOptions,
    name: 'trailing-name'
  });

  expectTypeOf<ReturnType<typeof store.getState>['increment']>().toEqualTypeOf<
    () => Promise<void>
  >();
  expectTypeOf<
    ReturnType<typeof namedSpreadStore.getState>['increment']
  >().toEqualTypeOf<() => Promise<void>>();
  expectTypeOf<
    ReturnType<typeof trailingNameStore.getState>['increment']
  >().toEqualTypeOf<() => Promise<void>>();
  expectTypeOf<
    ReturnType<typeof store.getInitialState>['increment']
  >().toEqualTypeOf<() => void>();
  expectTypeOf(store.getState().count).toEqualTypeOf<number>();

  // Client intent must contain a concrete transport-source key, even when
  // that key deliberately carries `undefined` for local fallback.
  // @ts-expect-error client options without a source are runtime-ambiguous
  const missingIntent: ClientStoreOptions<Counter> = { name: 'missing' };
  void missingIntent;

  const optionalWorker: { name: string; worker?: SharedWorker } = {
    name: 'optional'
  };
  // @ts-expect-error branch first so the options have an explicit client intent
  create<Counter>(slice, optionalWorker);

  store.destroy();
  namedSpreadStore.destroy();
  trailingNameStore.destroy();
});
