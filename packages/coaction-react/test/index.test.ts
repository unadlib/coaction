import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { create, createSelector, Observer, observer } from '../src';

test('types zero-options actions as synchronous', () => {
  const useStore = create<{
    count: number;
    increment: () => void;
  }>(() => ({
    count: 0,
    increment() {}
  }));

  const result: void = useStore.getState().increment();
  expect(result).toBeUndefined();
  useStore.destroy();
});

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

test('throws when immutable action mutates this directly outside set', () => {
  const useStore = create<{
    count: number;
    step: number;
    increment: () => void;
  }>(() => ({
    count: 0,
    step: 1,
    increment() {
      this.count += this.step;
    }
  }));

  expect(() => useStore.getState().increment()).toThrow(
    'Direct state mutation is not allowed in immutable Coaction stores. Wrap mutations in set(() => { ... }).'
  );
  expect(useStore.getState().count).toBe(0);
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
    const selectors = useStore.auto();
    const count = useStore(selectors.count);
    const double = useStore(selectors.double);
    const increment = useStore(selectors.increment);
    return React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'count' }, count),
      React.createElement('span', { 'data-testid': 'double' }, double),
      React.createElement('button', { onClick: increment }, 'inc')
    );
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(screen.getByTestId('double').textContent).toBe('0');
  fireEvent.click(screen.getByText('inc'));
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(screen.getByTestId('double').textContent).toBe('2');
});

test('selector subscriptions skip unrelated state updates', () => {
  const useStore = create<{
    count: number;
    label: string;
    increment: () => void;
    rename: () => void;
  }>((set) => ({
    count: 0,
    label: 'one',
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    },
    rename() {
      set((draft) => {
        draft.label = 'two';
      });
    }
  }));
  let renders = 0;

  const Counter = () => {
    renders += 1;
    const count = useStore((current) => current.count);
    return React.createElement('span', { 'data-testid': 'count' }, count);
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(renders).toBe(1);

  act(() => {
    useStore.getState().rename();
  });
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(renders).toBe(1);

  act(() => {
    useStore.getState().increment();
  });
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(renders).toBe(2);
});

test('autoSelector ignores non-enumerable getters', () => {
  const state = {
    count: 0,
    increment() {}
  };
  Object.defineProperty(state, 'hidden', {
    enumerable: false,
    configurable: true,
    get() {
      throw new Error('hidden getter should not be read');
    }
  });
  const useStore = create(() => state);

  expect(() => useStore.auto()).not.toThrow();
  expect(Object.prototype.hasOwnProperty.call(useStore.auto(), 'hidden')).toBe(
    false
  );
});

test('selector snapshots cache object results', () => {
  const useStore = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));

  const Counter = () => {
    const selected = useStore((current) => ({
      count: current.count
    }));
    return React.createElement(
      'button',
      {
        'data-testid': 'count',
        onClick: useStore.getState().increment
      },
      selected.count
    );
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');

  fireEvent.click(screen.getByTestId('count'));
  expect(screen.getByTestId('count').textContent).toBe('1');
});

test('observer tracks full-state reads without selector', () => {
  const useStore = create<{
    count: number;
    label: string;
    increment: () => void;
    rename: () => void;
  }>((set) => ({
    count: 0,
    label: 'one',
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    },
    rename() {
      set((draft) => {
        draft.label = 'two';
      });
    }
  }));
  let renders = 0;

  const Counter = observer(() => {
    renders += 1;
    const store = useStore();
    return React.createElement(
      'button',
      { 'data-testid': 'count', onClick: store.increment },
      store.count
    );
  });

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(renders).toBe(1);

  act(() => {
    useStore.getState().rename();
  });
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(renders).toBe(1);

  fireEvent.click(screen.getByTestId('count'));
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(renders).toBe(2);
});

test('observer keeps tracking through StrictMode subscription replay', () => {
  const useStore = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  let renders = 0;

  const Counter = observer(() => {
    renders += 1;
    const store = useStore();
    return React.createElement('span', { 'data-testid': 'count' }, store.count);
  });

  render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(Counter)
    ) as any
  );
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(renders).toBe(2);

  act(() => {
    useStore.getState().increment();
  });
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(renders).toBe(4);
});

test('observer keeps committed dependencies when a transition render suspends', async () => {
  const useStore = create<{
    count: number;
    label: string;
    setCount: (count: number) => void;
    setLabel: (label: string) => void;
  }>((set) => ({
    count: 0,
    label: 'one',
    setCount(count) {
      set((draft) => {
        draft.count = count;
      });
    },
    setLabel(label) {
      set((draft) => {
        draft.label = label;
      });
    }
  }));
  const never = new Promise(() => undefined);
  let setView!: React.Dispatch<
    React.SetStateAction<{
      mode: 'count' | 'label';
      suspend: boolean;
    }>
  >;
  let renders = 0;

  const Counter = observer(
    ({ mode, suspend }: { mode: 'count' | 'label'; suspend: boolean }) => {
      renders += 1;
      const store = useStore();
      const value = mode === 'count' ? store.count : store.label;
      if (suspend) {
        throw never;
      }
      return React.createElement('span', { 'data-testid': 'value' }, value);
    }
  );

  const App = () => {
    const [view, setViewState] = React.useState<{
      mode: 'count' | 'label';
      suspend: boolean;
    }>({
      mode: 'count',
      suspend: false
    });
    setView = setViewState;
    return React.createElement(
      React.Suspense,
      {
        fallback: React.createElement(
          'span',
          { 'data-testid': 'fallback' },
          'loading'
        )
      },
      React.createElement(Counter, view)
    );
  };

  render(React.createElement(App) as any);
  expect(screen.getByTestId('value').textContent).toBe('0');
  expect(renders).toBe(1);

  await act(async () => {
    React.startTransition(() => {
      setView({
        mode: 'label',
        suspend: true
      });
    });
  });
  expect(screen.getByTestId('value').textContent).toBe('0');
  expect(screen.queryByTestId('fallback')).toBeNull();

  act(() => {
    useStore.getState().setCount(1);
  });
  expect(screen.getByTestId('value').textContent).toBe('1');
  const rendersAfterCount = renders;

  act(() => {
    useStore.getState().setLabel('two');
  });
  expect(screen.getByTestId('value').textContent).toBe('1');
  expect(renders).toBe(rendersAfterCount);
});

test('observer tracks accessor getter dependencies', () => {
  const useStore = create<{
    count: number;
    label: string;
    readonly double: number;
    increment: () => void;
    rename: () => void;
  }>((set) => ({
    count: 0,
    label: 'one',
    get double() {
      return this.count * 2;
    },
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    },
    rename() {
      set((draft) => {
        draft.label = 'two';
      });
    }
  }));
  let renders = 0;

  const Counter = observer(() => {
    renders += 1;
    const store = useStore();
    return React.createElement(
      'span',
      { 'data-testid': 'double' },
      store.double
    );
  });

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('double').textContent).toBe('0');
  expect(renders).toBe(1);

  act(() => {
    useStore.getState().rename();
  });
  expect(screen.getByTestId('double').textContent).toBe('0');
  expect(renders).toBe(1);

  act(() => {
    useStore.getState().increment();
  });
  expect(screen.getByTestId('double').textContent).toBe('2');
  expect(renders).toBe(2);
});

test('Observer render prop tracks reads without selector', () => {
  const useStore = create<{
    count: number;
    label: string;
    increment: () => void;
    rename: () => void;
  }>((set) => ({
    count: 0,
    label: 'one',
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    },
    rename() {
      set((draft) => {
        draft.label = 'two';
      });
    }
  }));
  let renders = 0;

  const Counter = () =>
    React.createElement(Observer, {
      children: () => {
        renders += 1;
        const store = useStore();
        return React.createElement(
          'span',
          { 'data-testid': 'count' },
          store.count
        );
      }
    });

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(renders).toBe(1);

  act(() => {
    useStore.getState().rename();
  });
  expect(screen.getByTestId('count').textContent).toBe('0');
  expect(renders).toBe(1);

  act(() => {
    useStore.getState().increment();
  });
  expect(screen.getByTestId('count').textContent).toBe('1');
  expect(renders).toBe(2);
});

test('selector subscriptions isolate current values per component', () => {
  const useStore = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  const selectCount = (state: { count: number }) => state.count;
  let firstRenders = 0;
  let secondRenders = 0;

  const FirstCounter = () => {
    firstRenders += 1;
    const count = useStore(selectCount);
    return React.createElement('span', { 'data-testid': 'first' }, count);
  };
  const SecondCounter = () => {
    secondRenders += 1;
    const count = useStore(selectCount);
    return React.createElement('span', { 'data-testid': 'second' }, count);
  };

  render(
    React.createElement(
      'div',
      null,
      React.createElement(FirstCounter),
      React.createElement(SecondCounter)
    ) as any
  );
  expect(screen.getByTestId('first').textContent).toBe('0');
  expect(screen.getByTestId('second').textContent).toBe('0');

  act(() => {
    useStore.getState().increment();
  });

  expect(screen.getByTestId('first').textContent).toBe('1');
  expect(screen.getByTestId('second').textContent).toBe('1');
  expect(firstRenders).toBe(2);
  expect(secondRenders).toBe(2);
});

test('supports slices autoSelector', () => {
  const useStore = create(
    {
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
    },
    {
      sliceMode: 'slices'
    }
  );

  const Counter = () => {
    const selectors = useStore.auto();
    const count = useStore(selectors.counter.count);
    const double = useStore(selectors.counter.double);
    const increment = useStore(selectors.counter.increment);
    return React.createElement(
      'div',
      null,
      React.createElement('span', { 'data-testid': 'count' }, count),
      React.createElement('span', { 'data-testid': 'double' }, double),
      React.createElement('button', { onClick: increment }, 'inc')
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

test('createSelector snapshots cache object results', () => {
  const useCounter = create((set) => ({
    count: 0,
    increment() {
      set((draft) => {
        draft.count += 1;
      });
    }
  }));
  const useStep = create(() => ({
    step: 2
  }));
  const useMultiSelector = createSelector(useCounter, useStep);

  const Counter = () => {
    const selected = useMultiSelector((counter, step) => ({
      total: counter.count + step.step
    }));
    return React.createElement(
      'button',
      {
        'data-testid': 'total',
        onClick: useCounter.getState().increment
      },
      selected.total
    );
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('total').textContent).toBe('2');

  fireEvent.click(screen.getByTestId('total'));
  expect(screen.getByTestId('total').textContent).toBe('3');
});
