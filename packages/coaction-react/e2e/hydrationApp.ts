import React, { StrictMode, useEffect } from 'react';
import { create, observer } from '../src';

const h = React.createElement;
export const createHydrationStore = (preloaded: boolean) => {
  const store = create((set) => ({
    count: 0,
    user: { name: 'anonymous' },
    load(count = 7, name = 'Michael') {
      set(() => {
        this.count = count;
        this.user.name = name;
      });
    }
  }));
  if (preloaded) store.getState().load();
  return store;
};

export const hydrationApp = (
  store: ReturnType<typeof createHydrationStore>,
  strict: boolean,
  ready?: () => void
) => {
  const Selected = () =>
    h('span', { 'data-reader': 'selector' }, String(store((s) => s.count)));
  const Whole = () =>
    h('span', { 'data-reader': 'whole' }, String(store().count));
  const Observed = observer(() =>
    h('span', { 'data-reader': 'observer' }, String(store().count))
  );
  const Nested = () =>
    h(
      'span',
      { 'data-reader': 'nested' },
      store((s) => s.user.name)
    );
  const App = () => {
    useEffect(() => {
      ready?.();
    }, []);
    return h(
      React.Fragment,
      null,
      h(Selected),
      h(Whole),
      h(Observed),
      h(Nested)
    );
  };
  return strict ? h(StrictMode, null, h(App)) : h(App);
};
