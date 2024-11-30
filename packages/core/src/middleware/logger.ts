import { Middleware, Store } from '../interface';

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
const loggerStoreMap = new WeakMap<Store<any>, boolean>();

// TODO: support custom loggers
export const logger: (options?: {
  log?: (...args: any[]) => void;
  stackTrace?: boolean;
}) => Middleware =
  (loggerOptions = {}) =>
  (store) => {
    if (loggerStoreMap.has(store)) {
      return store;
    }
    loggerStoreMap.set(store, true);
    const apply = store.apply;
    store.apply = (state, patches) => {
      console.log('apply', JSON.stringify(patches));
      return apply(state, patches);
    };
    store.trace = (options) => {
      const date = formatTime(new Date());
      if (!traceTimeMap.get(options.id)) {
        traceTimeMap.set(options.id, timer.now());
        console.group(
          [
            `%c ${date} `,
            `method ${options.method}`,
            `[${options.id}]`,
            `parameters: ${JSON.stringify(options.parameters)}`
          ].join('%c'),
          'color: gray; font-weight: lighter;',
          'color: #03A9F4; font-weight: bold;',
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;'
        );
      } else {
        const start = traceTimeMap.get(options.id)!;
        traceTimeMap.delete(options.id);
        console.log(
          [
            `%c ${date} `,
            `method ${options.method}`,
            `[${options.id}]`,
            `(${(timer.now() - start).toFixed(3)} ms)`,
            `result: ${JSON.stringify(options.result)}`
          ].join('%c'),
          'color: gray; font-weight: lighter;',
          'color: #03A9F4;',
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;'
        );
        console.groupEnd();
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
          `%c ${date} `,
          'action anonymous ',
          `(${(timer.now() - now).toFixed(3)} ms)`
        ].join('%c'),
        'color: gray; font-weight: lighter;',
        'color: #4CAF50;',
        'color: gray; font-weight: lighter;'
      );
      if (loggerOptions.stackTrace) {
        console.trace('trace');
      }
      console.log('[state]', baseState);
      console.log('[next state]', JSON.stringify(store.getState()));
      console.groupEnd();
      return result;
    };
    return store;
  };
