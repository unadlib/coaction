// @vitest-environment node
import React from 'react';
import { renderToString } from 'react-dom/server';
import { create, observer } from '../src/index';

/**
 * On the server there is nothing to subscribe to, so every way of reading a
 * store is a plain read -- and they have to agree. A selector used to read the
 * initial state while the full-state form and `observer` read the current one,
 * so a store written to before rendering (a request preloading data, a
 * hydration middleware, an initialisation second phase) rendered two different
 * values for the same field, and the markup disagreed with what the client
 * hydrates against.
 */
const html = (element: React.ReactElement) => renderToString(element);

test('every way of reading a store agrees on the server', () => {
  const useStore = create<{ count: number; nested: { v: number } }>(() => ({
    count: 0,
    nested: { v: 0 }
  }));
  useStore.setState({ count: 1, nested: { v: 1 } });

  const selected = () =>
    React.createElement(
      'span',
      null,
      String((useStore as any)((state: any) => state.count))
    );
  const whole = () =>
    React.createElement('span', null, String((useStore as any)().count));
  const observed = observer(() =>
    React.createElement(
      'span',
      null,
      String((useStore as any)((state: any) => state.count))
    )
  );

  expect(html(React.createElement(selected))).toBe('<span>1</span>');
  expect(html(React.createElement(whole))).toBe('<span>1</span>');
  expect(html(React.createElement(observed))).toBe('<span>1</span>');
  useStore.destroy();
});

test('a nested selector reads the current state on the server too', () => {
  const useStore = create<{ user: { profile: { name: string } } }>(() => ({
    user: { profile: { name: 'initial' } }
  }));
  useStore.setState({ user: { profile: { name: 'loaded' } } });

  const Name = () =>
    React.createElement(
      'span',
      null,
      (useStore as any)((state: any) => state.user.profile.name)
    );
  expect(html(React.createElement(Name))).toBe('<span>loaded</span>');
  useStore.destroy();
});

test('an untouched store still renders what it was created with', () => {
  const useStore = create<{ count: number }>(() => ({ count: 7 }));
  const Count = () =>
    React.createElement(
      'span',
      null,
      String((useStore as any)((state: any) => state.count))
    );
  expect(html(React.createElement(Count))).toBe('<span>7</span>');
  useStore.destroy();
});
