import { history } from '../../coaction-history/src';
import { logger } from '../../coaction-logger/src';
import { persist, type PersistStorage } from '../../coaction-persist/src';
import { vi } from 'vitest';
import { create } from '../src';

const nextTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const createMemoryStorage = (): PersistStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (name: string) => map.get(name) ?? null,
    removeItem: (name: string) => {
      map.delete(name);
    },
    setItem: (name: string, value: string) => {
      map.set(name, value);
    }
  };
};

const createCounterStore = (middlewares: any[]) =>
  create(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares
    }
  );

test('persisted undo depends on whether history wraps persist', async () => {
  const storage = createMemoryStorage();
  const historyInsidePersist = createCounterStore([
    history(),
    persist({
      name: 'history-inside-persist',
      storage
    })
  ]);

  historyInsidePersist.getState().increment();
  await nextTick();
  (historyInsidePersist as any).history.undo();
  await nextTick();

  expect(historyInsidePersist.getState().count).toBe(0);
  expect(storage.getItem('history-inside-persist')).toContain('"count":1');

  const persistInsideHistory = createCounterStore([
    persist({
      name: 'persist-inside-history',
      storage
    }),
    history()
  ]);

  persistInsideHistory.getState().increment();
  await nextTick();
  (persistInsideHistory as any).history.undo();
  await nextTick();

  expect(persistInsideHistory.getState().count).toBe(0);
  expect(storage.getItem('persist-inside-history')).toContain('"count":0');
});

test('history undo is only logged when logger is inside history', () => {
  const bypassedLogger = {
    group: vi.fn(),
    groupCollapsed: vi.fn(),
    groupEnd: vi.fn(),
    log: vi.fn(),
    trace: vi.fn()
  };
  const loggerInsideHistory = createCounterStore([
    history(),
    logger({
      logger: bypassedLogger as any,
      collapsed: false
    })
  ]);

  loggerInsideHistory.getState().increment();
  bypassedLogger.group.mockClear();
  bypassedLogger.groupEnd.mockClear();
  (loggerInsideHistory as any).history.undo();

  expect(loggerInsideHistory.getState().count).toBe(0);
  expect(bypassedLogger.group).not.toHaveBeenCalled();
  expect(bypassedLogger.groupEnd).not.toHaveBeenCalled();

  const wrappedLogger = {
    group: vi.fn(),
    groupCollapsed: vi.fn(),
    groupEnd: vi.fn(),
    log: vi.fn(),
    trace: vi.fn()
  };
  const historyInsideLogger = createCounterStore([
    logger({
      logger: wrappedLogger as any,
      collapsed: false
    }),
    history()
  ]);

  historyInsideLogger.getState().increment();
  wrappedLogger.group.mockClear();
  wrappedLogger.groupEnd.mockClear();
  (historyInsideLogger as any).history.undo();

  expect(historyInsideLogger.getState().count).toBe(0);
  expect(wrappedLogger.group).toHaveBeenCalledTimes(1);
  expect(wrappedLogger.groupEnd).toHaveBeenCalledTimes(1);
});
