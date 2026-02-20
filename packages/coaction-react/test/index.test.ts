import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { create, createSelector } from '../src';

test('updates component with selector and full-state access', () => {
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      return this.count * 2;
    },
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const Counter = () => {
    const state = useStore();
    const count = useStore((current) => current.count);
    return React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'count' }, count),
      React.createElement('span', { 'data-testid': 'double' }, state.double),
      React.createElement('button', { onClick: state.increment }, 'inc')
    );
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(screen.getByTestId('double').textContent).toBe('0');
  fireEvent.click(screen.getByText('inc'));
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(screen.getByTestId('double').textContent).toBe('2');
});

test('supports autoSelector', () => {
  const useStore = create<{
    count: number;
    readonly double: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    get double() {
      return this.count * 2;
    },
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const Counter = () => {
    const state = useStore({ autoSelector: true });
    return React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'count' }, state.count),
      React.createElement('span', { 'data-testid': 'double' }, state.double),
      React.createElement('button', { onClick: state.increment }, 'inc')
    );
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(screen.getByTestId('double').textContent).toBe('0');
  fireEvent.click(screen.getByText('inc'));
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(screen.getByTestId('double').textContent).toBe('2');
});

test('supports slices autoSelector', () => {
  const useStore = create({
    counter: (set) => ({
      count: 0,
      get double() {
        return this.count * 2;
      },
      increment() {
        set((draft) => {
          draft.counter.count += 1;
        });
      }
    })
  });

  const Counter = () => {
    const state = useStore({ autoSelector: true });
    return React.createElement(
      'div',
      null,
      React.createElement(
        'span',
        { 'data-testid': 'count' },
        state.counter.count
      ),
      React.createElement(
        'span',
        { 'data-testid': 'double' },
        state.counter.double
      ),
      React.createElement('button', { onClick: state.counter.increment }, 'inc')
    );
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(screen.getByTestId('double').textContent).toBe('0');
  fireEvent.click(screen.getByText('inc'));
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(screen.getByTestId('double').textContent).toBe('2');
});

test('createSelector combines multiple stores', () => {
  const useCounter = create((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  const useStep = create((set) => ({
    step: 2,
    incrementStep() {
      set((draft) => {
        draft.step += 1;
      });
    }
  }));
  const useMultiSelector = createSelector(useCounter, useStep);

  const Counter = () => {
    const total = useMultiSelector(
      (counter, step) => counter.count + step.step
    );
    return React.createElement('span', { 'data-testid': 'total' }, total);
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('total').textContent).toBe('2');
  act(() => {
    useCounter.getState().increment();
  });
  expect(screen.getByTestId('total').textContent).toBe('3');
  act(() => {
    useStep.getState().incrementStep();
  });
  expect(screen.getByTestId('total').textContent).toBe('4');
});
