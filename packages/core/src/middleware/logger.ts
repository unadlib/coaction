import { Middleware } from '../interface';

const repeat = (str: string, times: number) => new Array(times + 1).join(str);

const pad = (num: number, maxLength: number) =>
  repeat('0', maxLength - num.toString().length) + num;

const formatTime = (time: Date) =>
  `${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`;

// Use performance API if it's available in order to get better precision
export const timer =
  typeof performance !== 'undefined' &&
  performance !== null &&
  typeof performance.now === 'function'
    ? performance
    : Date;

const traceTimeMap = new Map<string, number>();

export const logger: (log?: (...args: any[]) => void) => Middleware =
  (log = console.log) =>
  (store) => {
    store.trace = (options) => {
      const date = formatTime(new Date());
      if (!traceTimeMap.get(options.id)) {
        traceTimeMap.set(options.id, timer.now());
        console.log(
          date,
          `[${options.id}]`,
          options.method,
          options.parameters
        );
      } else {
        const start = traceTimeMap.get(options.id)!;
        traceTimeMap.delete(options.id);
        console.log(
          date,
          `[${options.id}]`,
          options.method,
          `(${(timer.now() - start).toFixed(3)} ms)`,
          `result: ${options.result}`
        );
      }
    };
    const setState = store.setState;
    store.setState = (state, action) => {
      const baseState = JSON.stringify(store.getState());
      const date = formatTime(new Date());
      const now = timer.now();
      const result = setState(state, action);
      console.groupCollapsed(
        [
          date,
          'action',
          'anonymous',
          `(${(timer.now() - now).toFixed(3)} ms)`
        ].join('%c '),
        'color: #dd9ab5; background-color: #4b2f36',
        'color: #dd9ab5; background-color: #4b2f36',
        'color: #dd9ab5; background-color: #4b2f36'
      );
      console.log('[state]', baseState);
      console.log('[next state]', JSON.stringify(store.getState()));
      console.groupEnd();
      return result;
    };
    return store;
  };
