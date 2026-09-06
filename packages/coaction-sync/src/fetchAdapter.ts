import type { SyncAdapter, SyncPullResult, SyncPushResult } from './types';

export type FetchSyncAdapterOptions = {
  /** Base endpoint. Pull uses GET and push uses POST unless overridden. */
  url: string;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit | (() => HeadersInit);
  pullInit?: RequestInit;
  pushInit?: RequestInit;
};

const resolveHeaders = (headers: FetchSyncAdapterOptions['headers']) =>
  typeof headers === 'function' ? headers() : headers;

const mergeHeaders = (
  base: HeadersInit | undefined,
  override: HeadersInit | undefined
) => {
  const merged = new Headers(base);
  if (override) {
    new Headers(override).forEach((value, key) => merged.set(key, value));
  }
  return merged;
};

const assertFetchResponse = async (response: Response) => {
  if (!response.ok) {
    throw new Error(
      `Coaction sync request failed with ${response.status} ${response.statusText}`
    );
  }
  if (response.status === 204) {
    return {};
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as SyncPullResult | SyncPushResult;
};

/** Minimal JSON-over-HTTP adapter for commit-based sync backends. */
export const createFetchSyncAdapter = ({
  url,
  fetch: fetchImpl = globalThis.fetch,
  headers,
  pullInit,
  pushInit
}: FetchSyncAdapterOptions): SyncAdapter => {
  if (!fetchImpl) {
    throw new Error(
      'createFetchSyncAdapter() requires a fetch implementation.'
    );
  }
  return {
    async pull(context) {
      const query = new URLSearchParams();
      if (context.cursor) query.set('cursor', context.cursor);
      if (context.revision) query.set('revision', context.revision);
      const suffix = query.size
        ? `${url.includes('?') ? '&' : '?'}${query}`
        : '';
      const response = await fetchImpl(`${url}${suffix}`, {
        ...pullInit,
        method: pullInit?.method ?? 'GET',
        headers: mergeHeaders(pullInit?.headers, resolveHeaders(headers))
      });
      return (await assertFetchResponse(response)) as SyncPullResult;
    },
    async push(mutations, context) {
      const requestHeaders = mergeHeaders(
        pushInit?.headers,
        resolveHeaders(headers)
      );
      if (!requestHeaders.has('content-type')) {
        requestHeaders.set('content-type', 'application/json');
      }
      const response = await fetchImpl(url, {
        ...pushInit,
        method: pushInit?.method ?? 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ mutations, ...context })
      });
      return (await assertFetchResponse(response)) as SyncPushResult;
    }
  };
};
