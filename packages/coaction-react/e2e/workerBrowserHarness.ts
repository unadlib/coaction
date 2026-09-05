import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
// Worker-backed stores live on the shared entry; the default entry links the
// local runtime only.
import { create } from '../src/shared';
import type { StoreWithAsyncFunction } from '../src/shared';
import {
  workerCounter,
  type WorkerCounterState
} from '../../../examples/e2e/browser/workerCounter';

const countTestId = 'react-worker-count';

type WorkerKind = 'shared' | 'web';

type WorkerConnectOptions = {
  kind: WorkerKind;
  name: string;
  expectedCount?: number;
};

type WorkerActionOptions = WorkerConnectOptions & {
  step?: number;
};

type WorkerErrorOptions = WorkerConnectOptions & {
  message?: string;
};

type WorkerClient = {
  kind: WorkerKind;
  name: string;
  useStore: StoreWithAsyncFunction<WorkerCounterState>;
  worker: SharedWorker | Worker;
  container: HTMLDivElement;
  root: Root;
};

export type WorkerScenarioResult = {
  count: number;
  renderedCount: number;
};

export type WorkerActionResult = {
  result: number;
  count: number;
};

export type WorkerErrorResult = {
  message: string;
};

export type ReactWorkerHarness = {
  connect: (options: WorkerConnectOptions) => Promise<WorkerScenarioResult>;
  add: (options: WorkerActionOptions) => Promise<WorkerActionResult>;
  addAsync: (options: WorkerActionOptions) => Promise<WorkerActionResult>;
  fail: (options: WorkerErrorOptions) => Promise<WorkerErrorResult>;
  read: (options: WorkerConnectOptions) => Promise<WorkerScenarioResult>;
  waitForCount: (
    options: WorkerConnectOptions
  ) => Promise<WorkerScenarioResult>;
  disconnect: (options: WorkerConnectOptions) => Promise<boolean>;
  disconnectAll: () => Promise<void>;
};

const clients = new Map<string, WorkerClient>();

const wait = (ms = 0) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 20
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await wait(intervalMs);
  }
  throw new Error('Timed out waiting for react worker scenario condition.');
};

const getClientKey = ({ kind, name }: WorkerConnectOptions) =>
  `${kind}:${name}`;

const getWorkerUrl = (name: string) => {
  const url = new URL(
    '../../../examples/e2e/browser/counter.worker.ts',
    import.meta.url
  );
  url.searchParams.set('name', name);
  return url;
};

// A real mounted component: proves useStore()'s useSyncExternalStore-based
// subscription actually re-renders when the SharedWorker/Worker pushes a
// remote update, not just that getState() returns the right value.
const CounterView = ({
  useStore
}: {
  useStore: StoreWithAsyncFunction<WorkerCounterState>;
}) => {
  const count = useStore((state) => state.count);
  return React.createElement(
    'span',
    { 'data-testid': countTestId },
    String(count)
  );
};

const disposeClient = (client: WorkerClient) => {
  client.root.unmount();
  client.container.remove();
  client.useStore.destroy();
  if (client.worker instanceof Worker) {
    client.worker.terminate();
    return;
  }
  client.worker.port.close();
};

const readRenderedCount = (client: WorkerClient) => {
  const node = client.container.querySelector(`[data-testid="${countTestId}"]`);
  return node ? Number(node.textContent) : Number.NaN;
};

const ensureClient = async (
  options: WorkerConnectOptions
): Promise<WorkerClient> => {
  const key = getClientKey(options);
  const existing = clients.get(key);
  if (existing) {
    return existing;
  }
  const workerUrl = getWorkerUrl(options.name);
  const worker =
    options.kind === 'shared'
      ? new SharedWorker(workerUrl, {
          type: 'module',
          name: options.name
        })
      : new Worker(workerUrl, {
          type: 'module',
          name: options.name
        });
  const useStore = create<WorkerCounterState>(workerCounter, {
    name: options.name,
    worker
  });
  const container = document.createElement('div');
  container.style.display = 'none';
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(React.createElement(CounterView, { useStore }));
  const client: WorkerClient = {
    kind: options.kind,
    name: options.name,
    useStore,
    worker,
    container,
    root
  };
  clients.set(key, client);
  await waitFor(() => !Number.isNaN(readRenderedCount(client)));
  return client;
};

const readCount = (client: WorkerClient) => client.useStore.getState().count;

const readResult = (client: WorkerClient): WorkerScenarioResult => ({
  count: readCount(client),
  renderedCount: readRenderedCount(client)
});

const connect = async (
  options: WorkerConnectOptions
): Promise<WorkerScenarioResult> => {
  const client = await ensureClient(options);
  await client.useStore.getState().add(0);
  if (typeof options.expectedCount === 'number') {
    await waitFor(() => readCount(client) === options.expectedCount);
    await waitFor(() => readRenderedCount(client) === options.expectedCount);
  }
  return readResult(client);
};

const add = async (
  options: WorkerActionOptions
): Promise<WorkerActionResult> => {
  const client = await ensureClient(options);
  const result = await client.useStore.getState().add(options.step);
  await waitFor(() => readRenderedCount(client) === result);
  return {
    result,
    count: readCount(client)
  };
};

const addAsync = async (
  options: WorkerActionOptions
): Promise<WorkerActionResult> => {
  const client = await ensureClient(options);
  const result = await client.useStore.getState().addAsync(options.step);
  await waitFor(() => readRenderedCount(client) === result);
  return {
    result,
    count: readCount(client)
  };
};

const fail = async (
  options: WorkerErrorOptions
): Promise<WorkerErrorResult> => {
  const client = await ensureClient(options);
  try {
    await client.useStore.getState().fail(options.message);
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error)
    };
  }
  throw new Error('Expected react worker action to fail.');
};

const read = async (
  options: WorkerConnectOptions
): Promise<WorkerScenarioResult> => {
  const client = await ensureClient(options);
  return readResult(client);
};

const waitForCount = async (
  options: WorkerConnectOptions
): Promise<WorkerScenarioResult> => {
  const client = await ensureClient(options);
  if (typeof options.expectedCount !== 'number') {
    throw new Error('expectedCount is required');
  }
  await waitFor(() => readCount(client) === options.expectedCount);
  await waitFor(() => readRenderedCount(client) === options.expectedCount);
  return readResult(client);
};

const disconnect = async (options: WorkerConnectOptions) => {
  const key = getClientKey(options);
  const client = clients.get(key);
  if (!client) {
    return false;
  }
  clients.delete(key);
  disposeClient(client);
  return true;
};

const disconnectAll = async () => {
  for (const client of clients.values()) {
    disposeClient(client);
  }
  clients.clear();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void disconnectAll();
  });
}

export const createReactWorkerHarness = (): ReactWorkerHarness => ({
  connect,
  add,
  addAsync,
  fail,
  read,
  waitForCount,
  disconnect,
  disconnectAll
});
