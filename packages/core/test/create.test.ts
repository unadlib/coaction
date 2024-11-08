// __tests__/store.test.ts

import { create } from '../src';
import { Transport } from 'data-transport';

describe('State Management Store Tests', () => {
  let store: ReturnType<typeof create>;
  let initialState: any;

  beforeEach(() => {
    // 初始化初始状态
    initialState = {
      counter: 0,
      text: 'hello',
      nested: {
        value: 42
      }
    };

    // 创建存储
    store = create((set, get) => ({
      ...initialState,
      increment: () => set((state: any) => ({ counter: state.counter + 1 })),
      setText: (newText: string) => set({ text: newText }),
      setNestedValue: (newValue: number) =>
        set((state: any) => {
          state.nested.value = newValue;
        })
    }));
  });

  test('should initialize with given state', () => {
    const state = store.getState();
    expect(state.counter).toBe(0);
    expect(state.text).toBe('hello');
    expect(state.nested.value).toBe(42);
  });

  test('should update state immutably', () => {
    store.setState({ counter: 1 });
    const state = store.getState();
    expect(state.counter).toBe(1);
    expect(state.text).toBe('hello');
  });

  test('should update state using function', () => {
    store.setState((state: any) => ({ counter: state.counter + 5 }));
    const state = store.getState();
    expect(state.counter).toBe(5);
  });

  test('should handle nested state updates', () => {
    store.setState((state: any) => {
      state.nested.value = 100;
    });
    const state = store.getState();
    expect(state.nested.value).toBe(100);
  });

  test('should execute actions', () => {
    const state = store.getState();
    state.increment();
    const newState = store.getState();
    expect(newState.counter).toBe(1);
  });

  test('should subscribe to state changes', () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    store.setState({ counter: 10 });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    store.setState({ counter: 20 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('no support async actions', async () => {
    expect(() => {
      store.setState(async (state: any) => {
        state.counter = await Promise.resolve(50);
      });
    }).toThrow('setState with async function is not supported');
  });

  test('should destroy store correctly', () => {
    const listener = jest.fn();
    store.subscribe(listener);

    store.destroy();
    store.setState({ counter: 100 });

    expect(listener).not.toHaveBeenCalled();
  });

  test('should handle setState within updater error', () => {
    expect(() => {
      store.setState((state: any) => {
        state.counter = 1;
        store.setState({ counter: 2 });
      });
    }).toThrow('setState cannot be called within the updater');
  });

  test('should not allow async functions in setState when mutableInstance is present', () => {
    expect(() => {
      store.setState(async (state: any) => {
        state.counter = await Promise.resolve(1);
      });
    }).toThrow('setState with async function is not supported');
  });

  test('should apply patches correctly', () => {
    const patches = [{ op: 'replace', path: '/text', value: 'world' }];
    // @ts-ignore
    store.apply(undefined, patches);
    const state = store.getState();
    expect(state.text).toBe('world');
  });
});
