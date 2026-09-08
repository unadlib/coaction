import React, { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { derive } from 'coaction/derived';
import { create, observer } from '../src';
import { sharedRegistry } from '../../core/src/sharedRegistry';

const h = React.createElement;

test('store-owned derivations work in selectors and observers through StrictMode remounts', () => {
  const useStore = create({ user: { name: 'Ada', age: 1 } });
  const name = derive(useStore, (s) => s.user.name, { deep: true });
  let selections = 0;
  const Selected = () =>
    h(
      'span',
      null,
      useStore(() => {
        selections++;
        return name();
      })
    );
  const Observed = observer(() => h('span', null, name()));
  const element = h(StrictMode, null, h(Selected), h(Observed));
  for (let i = 0; i < 2; i++) {
    const view = render(element);
    expect(view.container.textContent).toBe(i ? 'LinLin' : 'AdaAda');
    const before = selections;
    act(() =>
      useStore.setState((s) => {
        s.user.age++;
      })
    );
    expect(selections).toBe(before);
    act(() =>
      useStore.setState((s) => {
        s.user.name = 'Lin';
      })
    );
    expect(view.container.textContent).toBe('LinLin');
    view.unmount();
  }
  name.dispose();
  const { internal } = sharedRegistry.publicStatePathMeta.get(
    useStore.getState()
  ) as { internal: { reactivePathActiveCount: number } };
  expect(internal.reactivePathActiveCount).toBe(0);
  useStore.destroy();
});

test('deep derivations hydrate and follow subsequent commits', async () => {
  const useStore = create({ user: { name: 'Ada', age: 1 } });
  const name = derive(useStore, (s) => s.user.name, { deep: true });
  const App = observer(() => h('span', null, name()));
  const element = h(StrictMode, null, h(App));
  vi.stubGlobal('window', undefined);
  let html: string;
  try {
    html = renderToString(element);
  } finally {
    vi.unstubAllGlobals();
  }
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, element, {
        onRecoverableError: (error) => {
          errors.push(error);
        }
      });
    });
    expect(errors).toEqual([]);
    expect(container.textContent).toBe('Ada');
    act(() => useStore.setState({ user: { name: 'Lin', age: 2 } }));
    expect(container.textContent).toBe('Lin');
  } finally {
    act(() => root?.unmount());
    container.remove();
    useStore.destroy();
  }
  expect(() => name()).toThrow('disposed');
});
