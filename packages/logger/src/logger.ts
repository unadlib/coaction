import type { Middleware, Store } from 'coaction';

const repeat = (str: string, times: number) => new Array(times + 1).join(str);

const pad = (num: number, maxLength: number) =>
  repeat('0', maxLength - num.toString().length) + num;

const formatTime = (time: Date) =>
  `${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`;

export const timer =
  typeof performance !== 'undefined' &&
  performance !== null &&
  typeof performance.now === 'function'
    ? performance
    : Date;

const traceTimeMap = new Map<string, number>();
const loggerStoreMap = new WeakMap<Store, boolean>();

export interface Logger {
  log: (...args: any[]) => void;
  group: (...args: any[]) => void;
  groupCollapsed: (...args: any[]) => void;
  trace: (...args: any[]) => void;
  groupEnd: () => void;
}

export const logger: (options?: {
  /**
   * Custom log function
   */
  logger?: Logger;
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
  /**
   * Print verbose logs
   */
  verbose?: boolean;
}) => Middleware<any> =
  ({
    stackTrace = false,
    collapsed = true,
    serialized = false,
    logger = console,
    verbose = true // TODO: support verbose
  } = {}) =>
  (store) => {
    if (loggerStoreMap.has(store)) {
      return store;
    }
    loggerStoreMap.set(store, true);
    const apply = store.apply;
    store.apply = (state, patches) => {
      if (patches) {
        logger.log(
          `%c[Share: ${store.share}]%c[Store:${store.name}][Patches]`,
          'color: gray; font-weight: lighter;',
          'color: #BD67FB; font-weight: lighter;',
          serialized ? JSON.stringify(patches) : patches
        );
      }
      return apply(state, patches);
    };
    store.trace = (options) => {
      const date = formatTime(new Date());
      if (!traceTimeMap.get(options.id)) {
        traceTimeMap.set(options.id, timer.now());
        logger.group(
          [
            `%c${date} `,
            `[Share: ${store.share}]`,
            `[Store: ${store.name}][Method: ${options.sliceKey ? `${options.sliceKey}.` : ''}${options.method}]`,
            ` [UUID: ${options.id}]`,
            ` Parameters:`
          ].join('%c'),
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;',
          'color: #03A9F4; font-weight: bold;',
          'color: gray; font-weight: lighter;',
          'font-weight: lighter;',
          options.parameters
        );
        if (stackTrace) {
          logger.trace('trace');
        }
      } else {
        const start = traceTimeMap.get(options.id)!;
        traceTimeMap.delete(options.id);
        logger.log(
          [
            `%c${date} `,
            `[Share: ${store.share}]`,
            `[Store: ${store.name}][Method: ${options.sliceKey ? `${options.sliceKey}.` : ''}${options.method}]`,
            ` [UUID: ${options.id}] (${(timer.now() - start).toFixed(3)} ms)`,
            ` Result:`
          ].join('%c'),
          'color: gray; font-weight: lighter;',
          'color: gray; font-weight: lighter;',
          'color: #03A9F4;',
          'color: gray; font-weight: lighter;',
          'font-weight: lighter;',
          options.result
        );
        logger.groupEnd();
      }
    };
    const setState = store.setState;
    store.setState = (state, action) => {
      const date = formatTime(new Date());
      console[collapsed ? 'groupCollapsed' : 'group'](
        [
          `%c${date} `,
          `[Share: ${store.share}]`,
          `[Store: ${store.name}][Action]`
        ].join('%c'),
        'color: gray; font-weight: lighter;',
        'color: gray; font-weight: lighter;',
        'color: #4CAF50;'
      );
      if (stackTrace) {
        logger.trace('trace');
      }
      logger.log(
        `[Share: ${store.share}][Store: ${store.name}][State]`,
        serialized ? JSON.stringify(store.getPureState()) : store.getPureState()
      );
      const now = timer.now();
      const result = setState(state, action);
      logger.log(
        `[Share: ${store.share}][Store: ${store.name}][Next State]`,
        serialized ? JSON.stringify(store.getPureState()) : store.getPureState()
      );
      logger.log(
        [
          `%c${date} `,
          `[Share: ${store.share}]`,
          `[Store: ${store.name}][Action]`,
          ` (${(timer.now() - now).toFixed(3)} ms)`
        ].join('%c'),
        'color: gray; font-weight: lighter;',
        'color: gray; font-weight: lighter;',
        'color: #4CAF50;',
        'color: gray; font-weight: lighter;'
      );
      logger.groupEnd();
      return result;
    };
    return store;
  };
