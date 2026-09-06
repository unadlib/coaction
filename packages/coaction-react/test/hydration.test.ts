import React, { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act, cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import { create, observer } from '../src';

/**
 * Server markup and the client's first render have to agree.
 *
 * The SSR tests check what the server produces. This checks what happens when
 * React takes that markup and hydrates against it, which is where a
 * disagreement costs something: React reports a mismatch and throws the server
 * markup away, so the page flashes and the reason for rendering on the server
 * is gone. Reading the server output alone cannot see that.
 *
 * React hands a mismatch to `onRecoverableError`, so that is what these collect.
 * A hydration that reports nothing is the assertion.
 */
const h = React.createElement;

/**
 * Render the way a server does, from a file that needs a DOM to hydrate in.
 *
 * The runtime decides it is on a server by the absence of `window`, and this
 * suite runs in jsdom because hydration needs a document -- so without hiding
 * it, `renderToString` would take the client path and the markup would be
 * produced by the code the hydration is supposed to be checked against.
 */
const renderOnServer = (element: React.ReactElement) => {
  vi.stubGlobal('window', undefined);
  try {
    return renderToString(element);
  } finally {
    vi.unstubAllGlobals();
  }
};

type Counter = {
  count: number;
  user: { name: string };
  load: () => void;
};

const createCounter = () =>
  create<Counter>((set) => ({
    count: 0,
    user: { name: 'anonymous' },
    load() {
      set(() => {
        this.count = 7;
        this.user.name = 'Michael';
      });
    }
  }));

/** The four ways to read a store, rendered side by side. */
const readers = (useStore: ReturnType<typeof createCounter>) => {
  const Selected = () =>
    h('span', null, String(useStore((state) => state.count)));
  const Whole = () => h('span', null, String(useStore().count));
  const Observed = observer(() => h('span', null, String(useStore().count)));
  // A nested path, which is where the tracked selector and the server's plain
  // read had most room to disagree.
  const Nested = () =>
    h(
      'span',
      null,
      useStore((state) => state.user.name)
    );
  return () =>
    h(React.Fragment, null, h(Selected), h(Whole), h(Observed), h(Nested));
};

const hydrate = async (
  element: React.ReactElement,
  { strict = false }: { strict?: boolean } = {}
) => {
  const wrapped = strict ? h(StrictMode, null, element) : element;
  const html = renderOnServer(wrapped);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const reported: string[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, wrapped, {
      onRecoverableError: (error) => {
        reported.push(String((error as Error)?.message ?? error));
      }
    });
  });
  return {
    html,
    text: container.textContent,
    mismatches: reported,
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    }
  };
};

test('hydrates without a mismatch when nothing has been written', async () => {
  const useStore = createCounter();
  const { text, mismatches, unmount } = await hydrate(h(readers(useStore)));
  expect(mismatches).toEqual([]);
  expect(text).toBe('000anonymous');
  unmount();
  useStore.destroy();
});

test('hydrates without a mismatch when the store was written before rendering', async () => {
  // The case the SSR fix was about: a request preloading data, a hydration
  // middleware, an initialisation second phase. Every reader has to see the
  // same value, on both sides.
  const useStore = createCounter();
  useStore.getState().load();
  const { html, text, mismatches, unmount } = await hydrate(
    h(readers(useStore))
  );
  expect(mismatches).toEqual([]);
  expect(html).toBe(
    '<span>7</span><span>7</span><span>7</span><span>Michael</span>'
  );
  expect(text).toBe('777Michael');
  unmount();
  useStore.destroy();
});

test('hydrates under StrictMode', async () => {
  const useStore = createCounter();
  useStore.getState().load();
  const { text, mismatches, unmount } = await hydrate(h(readers(useStore)), {
    strict: true
  });
  expect(mismatches).toEqual([]);
  expect(text).toBe('777Michael');
  unmount();
  useStore.destroy();
});

test('a hydrated store stays subscribed', async () => {
  const useStore = createCounter();
  const { unmount } = await hydrate(h(readers(useStore)));

  act(() => {
    useStore.getState().load();
  });
  expect(document.body.textContent).toContain('777Michael');

  act(() => {
    useStore.setState({ user: { name: 'Jordan' } });
  });
  expect(document.body.textContent).toContain('Jordan');
  unmount();
  useStore.destroy();
});

test('a write between the server render and hydration reaches every reader', async () => {
  const useStore = createCounter();
  const App = readers(useStore);
  const html = renderOnServer(h(App));
  expect(html).toBe(
    '<span>0</span><span>0</span><span>0</span><span>anonymous</span>'
  );

  // The store moves on after the markup was produced -- a preload resolving, a
  // persisted state rehydrating. React renders against the new value, so a
  // mismatch here is expected and not what is being asserted: what matters is
  // that all four readers agree afterwards, and go on agreeing.
  useStore.getState().load();

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  const reported: string[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, h(App), {
      onRecoverableError: (error) => {
        reported.push(String((error as Error)?.message ?? error));
      }
    });
  });
  // React noticed, recovered, and rendered the current state.
  expect(reported.join(' ')).toMatch(/[Hh]ydrat/);
  expect(container.textContent).toBe('777Michael');

  act(() => {
    useStore.setState({ count: 9 });
  });
  expect(container.textContent).toBe('999Michael');
  act(() => root?.unmount());
  container.remove();
  useStore.destroy();
});
