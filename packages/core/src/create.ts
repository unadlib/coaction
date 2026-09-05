import { createAsyncClientStore } from './asyncClientStore';
import { WorkerType } from './constant';
import { createClientAction } from './getRawStateClientAction';
import { handleMainTransport } from './handleMainTransport';
import type {
  ClientStoreOptions,
  CreateState,
  Creator,
  Slice,
  StoreOptions
} from './interface';
import {
  failStoreSetup,
  failTransportInitialization,
  markStoreReady
} from './lifecycle';
import {
  assertSharedJsonValue,
  validateSharedActionPaths,
  validateSharedInitialState,
  validateSharedReplacementSource,
  validateSharedStateSerializable
} from './sharedState';
import { createStore } from './storeFactory';
import { validateUpdatePatches } from './transportProtocol';
import { wrapStore } from './wrapStore';

const wrapAsyncLocalAction = (action: (...args: unknown[]) => unknown) =>
  function (this: unknown, ...args: unknown[]) {
    assertSharedJsonValue(args);
    return Promise.resolve()
      .then(() => action.apply(this, args))
      .then((result) => {
        if (typeof result !== 'undefined') {
          assertSharedJsonValue(result);
        }
        return result;
      });
  };

const isMainWorkerType = (
  workerType:
    | StoreOptions<any>['workerType']
    | ClientStoreOptions<any>['workerType']
    | null
) =>
  workerType === 'SharedWorkerInternal' || workerType === 'WebWorkerInternal';

const isClientWorkerType = (
  workerType:
    | StoreOptions<any>['workerType']
    | ClientStoreOptions<any>['workerType']
    | null
) => workerType === 'SharedWorkerClient' || workerType === 'WebWorkerClient';

const validateCreateModeOptions = <T extends CreateState>(
  options: StoreOptions<T> | ClientStoreOptions<T>
) => {
  const storeTransport = (options as StoreOptions<T>).transport;
  const clientTransport = (options as ClientStoreOptions<T>).clientTransport;
  const worker = (options as ClientStoreOptions<T>).worker;
  const explicitWorkerType = options.workerType;

  if (storeTransport && clientTransport) {
    throw new Error(
      'transport and clientTransport cannot be used together, please use one authority model per store.'
    );
  }
  if (storeTransport && worker) {
    throw new Error(
      'transport and worker cannot be used together, please use one authority model per store.'
    );
  }
  if (clientTransport && worker) {
    throw new Error(
      'clientTransport and worker cannot be used together, please use one client transport source.'
    );
  }
  if (isMainWorkerType(explicitWorkerType) && (clientTransport || worker)) {
    throw new Error(
      'main workerType cannot be combined with client transport settings.'
    );
  }
  if (isClientWorkerType(explicitWorkerType) && storeTransport) {
    throw new Error('client workerType cannot be combined with transport.');
  }
};

/**
 * Create a local store, the main side of a shared store, or a client mirror of
 * a shared store.
 *
 * @remarks
 * Prefer the default `coaction` entry when transport support is not
 * required. It excludes the JSON protocol and reconnect runtime from the
 * consumer dependency graph.
 *
 * When client options (`worker` / `clientTransport`) are provided but no
 * transport is available at runtime, the store degrades to a strict local
 * authority. Its `getState()` actions still return promises and its values
 * obey the shared JSON contract:
 *
 * ```ts
 * const worker =
 *   typeof SharedWorker !== 'undefined'
 *     ? new SharedWorker(new URL('./worker.ts', import.meta.url), {
 *         type: 'module'
 *       })
 *     : undefined;
 *
 * // StoreWithAsyncFunction<T> whether or not the worker exists.
 * const store = create(slice, { worker });
 * await store.getState().action();
 * ```
 */
export const create: Creator = <T extends CreateState>(
  createState: Slice<T> | T,
  options: StoreOptions<T> | ClientStoreOptions<T> = {}
) => {
  const checkEnablePatches =
    Object.hasOwnProperty.call(options, 'enablePatches') &&
    !(options as StoreOptions<T>).enablePatches;
  validateCreateModeOptions(options);
  const workerType = options.workerType ?? WorkerType;
  const storeTransport = (options as StoreOptions<T>).transport;
  const share =
    isMainWorkerType(workerType) || storeTransport ? 'main' : undefined;
  const clientTransport = (options as ClientStoreOptions<T>).clientTransport;
  const clientWorker = (options as ClientStoreOptions<T>).worker;
  /**
   * Client options were accepted but no transport exists at runtime — e.g.
   * `create(slice, { worker })` with `worker: undefined` because
   * `SharedWorker` is unavailable. The store degrades to a local authority
   * whose `getState()` actions still return promises while state, arguments,
   * and results keep the shared JSON contract.
   */
  const degradeToLocalAsyncActions =
    !share &&
    !clientTransport &&
    !clientWorker &&
    (Object.prototype.hasOwnProperty.call(options, 'clientTransport') ||
      Object.prototype.hasOwnProperty.call(options, 'worker'));
  const buildStore = ({
    share,
    wrapLocalAction
  }: {
    share?: 'client' | 'main';
    wrapLocalAction?: typeof wrapAsyncLocalAction;
  }) => {
    const sharedContract = Boolean(share || wrapLocalAction);
    return createStore(createState, options, {
      share,
      wrapLocalAction,
      clientAction: share === 'client' ? createClientAction : undefined,
      collectActionPaths:
        share === 'main' ? validateSharedActionPaths : undefined,
      validateInitialState: sharedContract
        ? validateSharedInitialState
        : undefined,
      validatePatches: share === 'main' ? validateUpdatePatches : undefined,
      validateReplacementSource: sharedContract
        ? validateSharedReplacementSource
        : undefined,
      validateState: sharedContract
        ? validateSharedStateSerializable
        : undefined
    });
  };

  if (
    clientTransport ||
    clientWorker ||
    isClientWorkerType(options.workerType)
  ) {
    if (checkEnablePatches) {
      throw new Error('enablePatches: true is required for the async store');
    }
    return wrapStore(
      createAsyncClientStore(buildStore, options as ClientStoreOptions<T>)
    );
  }

  if (share === 'main' && checkEnablePatches) {
    throw new Error('enablePatches: true is required for the transport');
  }

  if (degradeToLocalAsyncActions && checkEnablePatches) {
    throw new Error('enablePatches: true is required for the async store');
  }

  let builtStore: ReturnType<typeof buildStore>;
  try {
    builtStore = buildStore({
      share,
      wrapLocalAction: degradeToLocalAsyncActions
        ? wrapAsyncLocalAction
        : undefined
    });
  } catch (error) {
    return failTransportInitialization(storeTransport, error);
  }
  const { store, internal } = builtStore;
  try {
    handleMainTransport(
      store,
      internal,
      storeTransport,
      workerType,
      checkEnablePatches,
      (options as StoreOptions<T>).transportPolicy
    );
    markStoreReady(store);
    internal.assertAlive?.('store initialization');
  } catch (error) {
    return failStoreSetup(store, error);
  }
  return wrapStore(store);
};
