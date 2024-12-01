import type { Middleware, Store } from 'coaction';

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
const loggerStoreMap = new WeakMap<Store, boolean>();

// TODO: support custom loggers
export const logger: (options?: {
  /**
   * Custom log function
   */
  log?: (...args: any[]) => void;
  /**
   * Print the stack trace
   */
  stackTrace?: boolean;
  /**
   * Collapse the log group
   */
  collapsed?: boolean;
  /**
   * Serialize the patches
   */
  serialized?: boolean;
}) => Middleware<any> =
  ({ stackTrace = false, collapsed = true, serialized = false } = {}) =>
  (store) => {
    if (loggerStoreMap.has(store)) {
      return store;
    }
    loggerStoreMap.set(store, true);
    const apply = store.apply;
    store.apply = (state, patches) => {
      if (patches) {
        console.log(
          '[patches]',
          serialized ? JSON.stringify(patches) : patches
        );
      }
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
            ` [${options.id}]`,
            ` [parameters]`
          ].join('%c'),
          'color: gray; font-weight: lighter;',
          'color: #03A9F4; font-weight: bold;',
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;',
          options.parameters
        );
        if (stackTrace) {
          console.trace('trace');
        }
      } else {
        const start = traceTimeMap.get(options.id)!;
        traceTimeMap.delete(options.id);
        console.log(
          [
            `%c ${date} `,
            `method ${options.method}`,
            ` (${(timer.now() - start).toFixed(3)} ms)`,
            ` [${options.id}]`,
            ` [result]`
          ].join('%c'),
          'color: gray; font-weight: lighter;',
          'color: #03A9F4;',
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;',
          options.result
        );
        console.groupEnd();
      }
    };
    const setState = store.setState;
    store.setState = (state, action) => {
      const date = formatTime(new Date());
      console[collapsed ? 'groupCollapsed' : 'group'](
        [`%c ${date} `, 'action '].join('%c'),
        'color: gray; font-weight: lighter;',
        'color: #4CAF50;'
      );
      if (stackTrace) {
        console.trace('trace');
      }
      console.log(
        '[state]',
        serialized ? JSON.stringify(store.getPureState()) : store.getPureState()
      );
      const now = timer.now();
      const result = setState(state, action);
      console.log(
        '[next state]',
        serialized ? JSON.stringify(store.getPureState()) : store.getPureState()
      );
      console.log(
        [
          `%c ${date} `,
          'action',
          `(${(timer.now() - now).toFixed(3)} ms)`
        ].join('%c'),
        'color: gray; font-weight: lighter;',
        'color: #4CAF50;',
        'color: gray; font-weight: lighter;'
      );
      console.groupEnd();
      return result;
    };
    return store;
  };
