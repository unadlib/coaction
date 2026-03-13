import { expectTypeOf } from 'vitest';
import type {
  ClientStoreOptions,
  PatchTransform,
  Store,
  StoreOptions,
  StoreTraceEvent
} from '../src';

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
