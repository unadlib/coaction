import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { whole, type Middleware } from 'coaction';
import { create, createSelector, Observer, observer } from '../src';
import { createReactStore } from '../src/runtime';

test('selector falls back to store subscription when no reactive path is available', () => {
  let state = { count: 0 };
  const listeners = new Set<() => void>();
  const store = {
    name: 'external-like',
    share: false as const,
    isSliceStore: false,
    setState: () => undefined,
    getState: () => state,
    getPureState: () => state,
    getInitialState: () => ({ count: 0 }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => listeners.clear(),
    apply: () => undefined
  };
  const useStore = createReactStore(() => store as any, {}, {});
  let renders = 0;

  const Counter = () => {
    renders += 1;
    const count = useStore((current: { count: number }) => current.count);
    return React.createElement(
      'span',
      { 'data-testid': 'fallback-count' },
      count
    );
  };

  render(React.createElement(Counter) as any);
  expect(screen.getByTestId('fallback-count').textContent).toBe('0');

  act(() => {
    state = { count: 1 };
    listeners.forEach((listener) => listener());
  });

  expect(screen.getByTestId('fallback-count').textContent).toBe('1');
  expect(renders).toBe(2);
  useStore.destroy();
});

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

test('tracked selectors do not recompute for unrelated paths', () => {
  const useStore = create<{
    user: { name: string; age: number };
    label: string;
    rename: () => void;
    birthday: () => void;
  }>((set) => ({
    user: { name: 'Michael', age: 30 },
    label: 'one',
    rename() {
      set(() => {
        this.label = 'two';
      });
    },
    birthday() {
      set(() => {
        this.user.age += 1;
      });
    }
  }));
  let selectorRuns = 0;
  let renders = 0;

  const Name = () => {
    renders += 1;
    const name = useStore((state) => {
      selectorRuns += 1;
      return state.user.name;
    });
    return React.createElement('span', { 'data-testid': 'name' }, name);
  };

  render(React.createElement(Name) as any);
  expect(selectorRuns).toBe(1);
  expect(renders).toBe(1);

  act(() => useStore.getState().rename());
  act(() => useStore.getState().birthday());
  expect(selectorRuns).toBe(1);
  expect(renders).toBe(1);
});

test('tracked selectors switch dynamic dependencies after commit', () => {
  const useStore = create<{
    useLeft: boolean;
    left: number;
    right: number;
    toggle: () => void;
    bumpLeft: () => void;
    bumpRight: () => void;
  }>((set) => ({
    useLeft: true,
    left: 1,
    right: 10,
    toggle() {
      set(() => {
        this.useLeft = !this.useLeft;
      });
    },
    bumpLeft() {
      set(() => {
        this.left += 1;
      });
    },
    bumpRight() {
      set(() => {
        this.right += 1;
      });
    }
  }));
  let selectorRuns = 0;

  const Value = () => {
    const value = useStore((state) => {
      selectorRuns += 1;
      return state.useLeft ? state.left : state.right;
    });
    return React.createElement('span', { 'data-testid': 'dynamic' }, value);
  };

  render(React.createElement(Value) as any);
  expect(screen.getByTestId('dynamic').textContent).toBe('1');

  act(() => useStore.getState().toggle());
  expect(screen.getByTestId('dynamic').textContent).toBe('10');
  const runsAfterToggle = selectorRuns;

  act(() => useStore.getState().bumpLeft());
  expect(selectorRuns).toBe(runsAfterToggle);
  expect(screen.getByTestId('dynamic').textContent).toBe('10');

  act(() => useStore.getState().bumpRight());
  expect(screen.getByTestId('dynamic').textContent).toBe('11');
  expect(selectorRuns).toBeGreaterThan(runsAfterToggle);
});

test('object-valued selectors subscribe to their terminal path', () => {
  const useStore = create<{
    user: { profile: { name: string; age: number } };
    birthday: () => void;
  }>((set) => ({
    user: { profile: { name: 'Michael', age: 30 } },
    birthday() {
      set(() => {
        this.user.profile.age += 1;
      });
    }
  }));
  let renders = 0;

  const Profile = () => {
    renders += 1;
    const profile = useStore((state) => state.user.profile);
    return React.createElement(
      'span',
      { 'data-testid': 'profile-age' },
      profile.age
    );
  };

  render(React.createElement(Profile) as any);
  expect(screen.getByTestId('profile-age').textContent).toBe('30');
  act(() => useStore.getState().birthday());
  expect(screen.getByTestId('profile-age').textContent).toBe('31');
  expect(renders).toBe(2);
});

test('observer tracks Coaction object values passed directly through React props', () => {
  const useStore = create<{
    user: { profile: { age: number } };
    birthday: () => void;
  }>((set) => ({
    user: { profile: { age: 30 } },
    birthday() {
      set(() => {
        this.user.profile.age += 1;
      });
    }
  }));
  let parentRenders = 0;
  const Child = ({ profile }: { profile: { age: number } }) =>
    React.createElement(
      'span',
      { 'data-testid': 'profile-prop-age' },
      profile.age
    );
  const Parent = observer(() => {
    parentRenders += 1;
    const state = useStore();
    return React.createElement(Child, { profile: state.user.profile });
  });

  render(React.createElement(Parent) as any);
  expect(screen.getByTestId('profile-prop-age').textContent).toBe('30');

  act(() => useStore.getState().birthday());
  expect(screen.getByTestId('profile-prop-age').textContent).toBe('31');
  expect(parentRenders).toBe(2);
});

test('object-valued selector keeps equality filtering for unrelated dependencies', () => {
  const useStore = create<{
    user: { name: string };
    flag: boolean;
    toggle: () => void;
  }>((set) => ({
    user: { name: 'Michael' },
    flag: false,
    toggle() {
      set(() => {
        this.flag = !this.flag;
      });
    }
  }));
  let renders = 0;
  let selectorRuns = 0;

  const User = () => {
    renders += 1;
    const user = useStore((state) => {
      selectorRuns += 1;
      void state.flag;
      return state.user;
    });
    return React.createElement(
      'span',
      { 'data-testid': 'stable-user' },
      user.name
    );
  };

  render(React.createElement(User) as any);
  const initialRuns = selectorRuns;
  act(() => useStore.getState().toggle());

  expect(selectorRuns).toBeGreaterThan(initialRuns);
  expect(renders).toBe(1);
  expect(screen.getByTestId('stable-user').textContent).toBe('Michael');
});

test('selector returning the complete state tracks the root aggregate', () => {
  const useStore = create<{
    count: number;
    increment: () => void;
  }>((set) => ({
    count: 0,
    increment() {
      set(() => {
        this.count += 1;
      });
    }
  }));
  let renders = 0;

  const WholeState = () => {
    renders += 1;
    const state = useStore((current) => current);
    return React.createElement(
      'span',
      { 'data-testid': 'whole-count' },
      state.count
    );
  };

  render(React.createElement(WholeState) as any);
  expect(screen.getByTestId('whole-count').textContent).toBe('0');

  act(() => useStore.getState().increment());
  expect(screen.getByTestId('whole-count').textContent).toBe('1');
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

test('createSelector skips unrelated paths across multiple stores', () => {
  const useCounter = create((set) => ({
    count: 0,
    label: 'one',
    rename() {
      set(() => {
        this.label = 'two';
      });
    }
  }));
  const useStep = create((set) => ({
    step: 2,
    label: 'step',
    rename() {
      set(() => {
        this.label = 'changed';
      });
    }
  }));
  const useMultiSelector = createSelector(useCounter, useStep);
  let selectorRuns = 0;
  let renders = 0;

  const Counter = () => {
    renders += 1;
    const total = useMultiSelector((counter, step) => {
      selectorRuns += 1;
      return counter.count + step.step;
    });
    return React.createElement(
      'span',
      { 'data-testid': 'isolated-total' },
      total
    );
  };

  render(React.createElement(Counter) as any);
  expect(selectorRuns).toBe(1);
  expect(renders).toBe(1);

  act(() => useCounter.getState().rename());
  act(() => useStep.getState().rename());
  expect(selectorRuns).toBe(1);
  expect(renders).toBe(1);
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

test('unmounting a tracked component stops the store paying for patches', async () => {
  let patchCalls = 0;
  const countPatches: Middleware<{
    user: { name: string; age: number };
    setAge: (age: number) => void;
  }> = (store) => {
    store.patch = (transition) => {
      patchCalls += 1;
      return transition;
    };
    return store;
  };
  const useStore = create(
    (set) => ({
      user: { name: 'Michael', age: 30 },
      setAge(age: number) {
        set(() => {
          this.user.age = age;
        });
      }
    }),
    { middlewares: [countPatches] }
  );

  const Name = () => {
    const name = useStore((state) => state.user.name);
    return React.createElement('span', { 'data-testid': 'held-name' }, name);
  };
  const view = render(React.createElement(Name) as any);

  // A live tracked path forces the patch-generating write path.
  act(() => useStore.getState().setAge(31));
  expect(patchCalls).toBeGreaterThan(0);

  act(() => view.unmount());
  // Let the release timer run; the tracked path nodes go with it.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const afterUnmount = patchCalls;
  act(() => useStore.getState().setAge(32));
  act(() => useStore.getState().setAge(33));
  expect(patchCalls).toBe(afterUnmount);
  useStore.destroy();
});

test('whole() keeps a scanning selector reactive without per-element tracking', () => {
  const useStore = create<{
    rows: number[];
    other: number;
    bump: () => void;
    touchOther: () => void;
  }>((set) => ({
    rows: [1, 2, 3],
    other: 0,
    bump() {
      set(() => {
        this.rows[0] += 1;
      });
    },
    touchOther() {
      set(() => {
        this.other += 1;
      });
    }
  }));

  let selectorRuns = 0;
  const Total = () => {
    const total = useStore((state) => {
      selectorRuns += 1;
      return whole(state.rows).reduce((sum, n) => sum + n, 0);
    });
    return React.createElement('span', { 'data-testid': 'whole-total' }, total);
  };
  render(React.createElement(Total) as any);
  expect(screen.getByTestId('whole-total').textContent).toBe('6');

  const before = selectorRuns;
  act(() => useStore.getState().touchOther());
  expect(selectorRuns).toBe(before);

  act(() => useStore.getState().bump());
  expect(selectorRuns).toBeGreaterThan(before);
  expect(screen.getByTestId('whole-total').textContent).toBe('7');
  useStore.destroy();
});

/**
 * The comparison docs described this path as version + recompute + `Object.is`,
 * at parity with Zustand. It has not been that since the selector started
 * running inside a reactive tracker: the paths it reads become its
 * dependencies, and a write touching none of them does not reach it at all.
 * This pins the behaviour the docs now describe.
 */
test('a selector does not re-run for a write it does not depend on', () => {
  const useStore = create<{
    user: { name: string };
    unrelated: number;
    renameUser: () => void;
    touchUnrelated: () => void;
  }>((set) => ({
    user: { name: 'Michael' },
    unrelated: 0,
    renameUser() {
      set(() => {
        this.user.name = 'Jordan';
      });
    },
    touchUnrelated() {
      set(() => {
        this.unrelated += 1;
      });
    }
  }));
  let selectorRuns = 0;
  const Name = () => {
    const name = useStore((state) => {
      selectorRuns += 1;
      return state.user.name;
    });
    return React.createElement('span', null, name);
  };
  render(React.createElement(Name));
  const runsAfterMount = selectorRuns;

  act(() => {
    useStore.getState().touchUnrelated();
  });
  expect(selectorRuns).toBe(runsAfterMount);

  act(() => {
    useStore.getState().renameUser();
  });
  expect(selectorRuns).toBeGreaterThan(runsAfterMount);
  expect(screen.getByText('Jordan')).toBeTruthy();
  useStore.destroy();
});
