import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

// The degradable client contract belongs to the shared entry: its actions are
// async because they may cross a worker boundary, and stay async when the
// worker turns out to be absent. The default entry is local and stays sync.
import { create, observer, type StoreWithAsyncFunction } from '../src/shared';

type Counter = {
  count: number;
  increment: () => void;
};

const counterSlice = (set: (fn: (state: Counter) => void) => void) => ({
  count: 0,
  increment() {
    set((state) => {
      state.count += 1;
    });
  }
});

describe('degradable client store (worker: undefined)', () => {
  test('hook keeps the async action contract in the local fallback', async () => {
    const clientOptions = { worker: undefined };
    const useCounter: StoreWithAsyncFunction<Counter> = create<Counter>(
      counterSlice,
      { name: 'react-fallback', ...clientOptions }
    );

    const CounterView = observer(() => {
      const state = useCounter();
      return React.createElement(
        'span',
        { 'data-testid': 'count' },
        state.count
      );
    });

    render(React.createElement(CounterView) as any);
    expect(screen.getByTestId('count').textContent).toBe('0');

    await act(async () => {
      const pending = useCounter.getState().increment();
      expect(pending).toBeInstanceOf(Promise);
      await pending;
    });

    await waitFor(() => {
      expect(screen.getByTestId('count').textContent).toBe('1');
    });

    // Call sites written for shared mode keep working unchanged.
    await act(async () => {
      await useCounter.getState().increment();
    });
    expect(useCounter.getState().count).toBe(2);
    useCounter.destroy();
  });

  test('selector and auto selector readers also observe the fallback', async () => {
    const useCounter = create<Counter>(counterSlice, { worker: undefined });
    const selectors = useCounter.auto();

    const SelectorView = () => {
      const count = useCounter(selectors.count);
      return React.createElement('span', { 'data-testid': 'selector' }, count);
    };

    render(React.createElement(SelectorView) as any);
    expect(screen.getByTestId('selector').textContent).toBe('0');

    await act(async () => {
      await useCounter.getState().increment();
    });

    await waitFor(() => {
      expect(screen.getByTestId('selector').textContent).toBe('1');
    });
    useCounter.destroy();
  });
});
