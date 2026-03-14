import type { CreateState, MiddlewareStore } from './interface';
import type { Internal } from './internal';
import { uuid } from './utils';

const transportErrorMarker = '__coactionTransportError__';

const isTransportErrorEnvelope = (
  value: unknown
): value is Record<string, unknown> & { message: string } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    (value as Record<string, unknown>)[transportErrorMarker] === true &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
};

const isLegacyTransportErrorEnvelope = (
  value: unknown
): value is { $$Error: string } => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.$$Error === 'string' &&
    candidate.$$Error.length > 0 &&
    Object.keys(candidate).length === 1
  );
};

type CreateClientActionOptions<T extends CreateState> = {
  clientExecuteSyncTimeoutMs: number;
  internal: Internal<T>;
  key: string;
  store: MiddlewareStore<T>;
  sliceKey?: string;
};

export const createClientAction = <T extends CreateState>({
  clientExecuteSyncTimeoutMs,
  internal,
  key,
  store,
  sliceKey
}: CreateClientActionOptions<T>) => {
  return (...args: unknown[]) => {
    let actionId: string | undefined;
    let done: ((result: any) => void) | undefined;
    if (store.trace) {
      actionId = uuid();
      store.trace({
        method: key,
        parameters: args,
        id: actionId,
        sliceKey
      });
      done = (result: any) => {
        store.trace!({
          method: key,
          id: actionId!,
          result,
          sliceKey
        });
      };
    }
    const keys = sliceKey ? [sliceKey, key] : [key];
    // emit the action to worker or main thread execute
    return store
      .transport!.emit('execute', keys, args)
      .then(async (response: unknown) => {
        const result = Array.isArray(response) ? response[0] : response;
        const sequence = Array.isArray(response)
          ? typeof response[1] === 'number'
            ? response[1]
            : internal.sequence
          : internal.sequence;
        if (internal.sequence < sequence) {
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              `The sequence of the action is not consistent.`,
              sequence,
              internal.sequence
            );
          }
          await new Promise<void>((resolve, reject) => {
            let settled = false;
            let unsubscribe = () => {};
            const timeoutRef: {
              current?: ReturnType<typeof setTimeout>;
            } = {};
            const cleanup = () => {
              unsubscribe();
              if (typeof timeoutRef.current !== 'undefined') {
                clearTimeout(timeoutRef.current);
              }
            };
            const finishResolve = () => {
              if (settled) return;
              settled = true;
              cleanup();
              resolve();
            };
            const finishReject = (error: unknown) => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(error);
            };
            unsubscribe = store.subscribe(() => {
              if (internal.sequence >= sequence) {
                finishResolve();
              }
            });
            timeoutRef.current = setTimeout(() => {
              void store
                .transport!.emit('fullSync')
                .then((latest) => {
                  const next = latest as {
                    state: string;
                    sequence: number;
                  };
                  if (
                    typeof next.state !== 'string' ||
                    typeof next.sequence !== 'number'
                  ) {
                    throw new Error('Invalid fullSync payload');
                  }
                  if (next.sequence >= sequence) {
                    store.apply(JSON.parse(next.state));
                    internal.sequence = next.sequence;
                    finishResolve();
                    return;
                  }
                  finishReject(
                    new Error(
                      `Stale fullSync sequence: expected >= ${sequence}, got ${next.sequence}`
                    )
                  );
                })
                .catch((error) => {
                  finishReject(error);
                });
            }, clientExecuteSyncTimeoutMs);
          });
        }
        if (isTransportErrorEnvelope(result)) {
          done?.(result);
          throw new Error(result.message);
        }
        if (isLegacyTransportErrorEnvelope(result)) {
          done?.(result);
          throw new Error(result.$$Error);
        }
        done?.(result);
        return result;
      });
  };
};
