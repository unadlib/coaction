import { create } from 'coaction';
import { logger, type Logger } from '@coaction/logger';

type CounterState = {
  count: number;
  increment: () => void;
};

type LogEvent = {
  method: string;
  args: unknown[];
};

export const runExample = () => {
  const events: LogEvent[] = [];
  const sink: Logger = {
    log: (...args) => {
      events.push({ method: 'log', args });
    },
    group: (...args) => {
      events.push({ method: 'group', args });
    },
    groupCollapsed: (...args) => {
      events.push({ method: 'groupCollapsed', args });
    },
    trace: (...args) => {
      events.push({ method: 'trace', args });
    },
    groupEnd: () => {
      events.push({ method: 'groupEnd', args: [] });
    }
  };

  const store = create<CounterState>(
    (set) => ({
      count: 0,
      increment() {
        set((draft) => {
          draft.count += 1;
        });
      }
    }),
    {
      middlewares: [
        logger({
          logger: sink,
          collapsed: true,
          stackTrace: false
        })
      ]
    }
  );

  store.getState().increment();
  const result = {
    count: store.getState().count,
    eventCount: events.length
  };
  store.destroy();

  return result;
};
