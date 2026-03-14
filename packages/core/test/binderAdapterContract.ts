import {
  createTransport,
  mockPorts,
  type WorkerMainTransportOptions
} from 'data-transport';
import { describe, expect, test, vi } from 'vitest';
import { create } from '../src';

type Awaitable<T> = T | Promise<T>;

const waitForNextTick = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const waitForConnect = async (
  clientTransport: ReturnType<typeof createTransport>
) => {
  await new Promise<void>((resolve) => {
    clientTransport.onConnect(() => {
      setTimeout(resolve);
    });
  });
};

const createStoreName = (packageName: string, suffix: string) =>
  `${packageName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${suffix}`;

export const binderSlicesUnsupportedMessage =
  'Third-party state binding does not support Slices mode. Please inject a whole store instead.';

export type LocalBinderAdapterContract = {
  createState: (...args: any[]) => any;
  readValue: (store: any) => number;
  invokeUpdate: (store: any) => Awaitable<unknown>;
  expectedValueAfterUpdate: number;
  writeExternal: () => Awaitable<unknown>;
  expectedValueAfterExternalWrite: number;
  writeExternalAfterDestroy?: () => Awaitable<unknown>;
  cleanup?: () => Awaitable<void>;
};

export type WorkerBinderAdapterContract = {
  createServerState: (...args: any[]) => any;
  createClientState: (...args: any[]) => any;
  readValue: (store: any) => number;
  invokeServer: (store: any) => Awaitable<unknown>;
  expectedValueAfterServerUpdate: number;
  invokeClient: (store: any) => unknown;
  expectedValueAfterClientUpdate: number;
  writeServerExternal?: () => Awaitable<unknown>;
  expectedValueAfterServerExternalWrite?: number;
  cleanup?: () => Awaitable<void>;
};

export const runBinderAdapterContract = ({
  packageName,
  createLocalContract,
  createWorkerContract
}: {
  packageName: string;
  createLocalContract: () => LocalBinderAdapterContract;
  createWorkerContract?: () => WorkerBinderAdapterContract;
}) => {
  describe(`${packageName} binder adapter contract`, () => {
    test('local subscribe/update/external write/destroy', async () => {
      const contract = createLocalContract();
      const store = create(contract.createState, {
        name: createStoreName(packageName, 'local-contract')
      });
      const listener = vi.fn();

      try {
        store.subscribe(() => {
          contract.readValue(store);
          listener();
        });
        listener.mockClear();

        await contract.invokeUpdate(store);
        await vi.waitFor(() => {
          expect(contract.readValue(store)).toBe(
            contract.expectedValueAfterUpdate
          );
        });
        await vi.waitFor(() => {
          expect(listener).toHaveBeenCalled();
        });

        listener.mockClear();
        await contract.writeExternal();
        await vi.waitFor(() => {
          expect(contract.readValue(store)).toBe(
            contract.expectedValueAfterExternalWrite
          );
        });
        await vi.waitFor(() => {
          expect(listener).toHaveBeenCalled();
        });

        listener.mockClear();
        store.destroy();
        await (contract.writeExternalAfterDestroy ?? contract.writeExternal)();
        await waitForNextTick();
        expect(listener).not.toHaveBeenCalled();
      } finally {
        store.destroy();
        await contract.cleanup?.();
      }
    });

    test('rejects slices mode', async () => {
      const contract = createLocalContract();
      try {
        expect(() => {
          create(
            {
              counter: contract.createState
            },
            {
              name: createStoreName(packageName, 'slices-contract'),
              sliceMode: 'slices'
            }
          );
        }).toThrow(binderSlicesUnsupportedMessage);
      } finally {
        await contract.cleanup?.();
      }
    });

    if (createWorkerContract) {
      test('shared main/client execution and external writes', async () => {
        const contract = createWorkerContract();
        const ports = mockPorts();
        const serverTransport = createTransport(
          'WebWorkerInternal',
          ports.main
        );
        const clientTransport = createTransport(
          'WebWorkerClient',
          ports.create() as WorkerMainTransportOptions
        );
        const name = createStoreName(packageName, 'worker-contract');
        const serverStore = create(contract.createServerState, {
          name,
          transport: serverTransport
        });
        let clientStore: ReturnType<typeof create> | undefined;

        try {
          await contract.invokeServer(serverStore);
          await vi.waitFor(() => {
            expect(contract.readValue(serverStore)).toBe(
              contract.expectedValueAfterServerUpdate
            );
          });

          clientStore = create(contract.createClientState, {
            name,
            clientTransport
          });

          await waitForConnect(clientTransport);
          await vi.waitFor(() => {
            expect(contract.readValue(clientStore)).toBe(
              contract.expectedValueAfterServerUpdate
            );
          });

          const clientResult = contract.invokeClient(clientStore);
          expect(clientResult).toBeInstanceOf(Promise);
          await clientResult;

          await vi.waitFor(() => {
            expect(contract.readValue(serverStore)).toBe(
              contract.expectedValueAfterClientUpdate
            );
          });
          await vi.waitFor(() => {
            expect(contract.readValue(clientStore)).toBe(
              contract.expectedValueAfterClientUpdate
            );
          });

          if (
            contract.writeServerExternal &&
            typeof contract.expectedValueAfterServerExternalWrite === 'number'
          ) {
            await contract.writeServerExternal();
            await vi.waitFor(() => {
              expect(contract.readValue(serverStore)).toBe(
                contract.expectedValueAfterServerExternalWrite
              );
            });
            await vi.waitFor(() => {
              expect(contract.readValue(clientStore)).toBe(
                contract.expectedValueAfterServerExternalWrite
              );
            });
          }
        } finally {
          clientStore?.destroy();
          serverStore.destroy();
          await contract.cleanup?.();
        }
      });

      test('rejects slices mode in shared main mode', async () => {
        const contract = createWorkerContract();
        const ports = mockPorts();
        const serverTransport = createTransport(
          'WebWorkerInternal',
          ports.main
        );

        try {
          expect(() => {
            create(
              {
                counter: contract.createServerState
              },
              {
                name: createStoreName(packageName, 'worker-slices-contract'),
                transport: serverTransport,
                sliceMode: 'slices'
              }
            );
          }).toThrow(binderSlicesUnsupportedMessage);
        } finally {
          await contract.cleanup?.();
        }
      });
    }
  });
};
