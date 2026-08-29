import { create, type AsyncStore, type Slice } from '../src';

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

type TodosState = {
  todos: Todo[];
  remaining: number;
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  failTodo: () => never;
};

const todosSlice: Slice<TodosState> = (set, get) => ({
  todos: [
    { id: 'a', text: 'first', completed: false },
    { id: 'b', text: 'second', completed: true }
  ],
  remaining: get(
    (state) => [state.todos],
    (todos) => todos.filter((todo) => !todo.completed).length
  ),
  addTodo(text) {
    set((state) => {
      state.todos.push({
        id: `id-${state.todos.length}`,
        text,
        completed: false
      });
    });
  },
  toggleTodo(id) {
    set((state) => {
      const todo = state.todos.find((todo) => todo.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
    });
  },
  failTodo() {
    throw new Error('boom');
  }
});

const createFallbackStore = () =>
  create<TodosState>(todosSlice, { worker: undefined });

describe('degradable client store (async local fallback)', () => {
  test('degrades to a local store when worker is undefined', async () => {
    const store = createFallbackStore();

    expect(store.transport).toBeUndefined();
    expect(store.share).toBe(false);

    // Actions still return promises, matching the shared-client contract.
    const pending = store.getState().addTodo('third');
    expect(pending).toBeInstanceOf(Promise);
    expect(store.getState().todos).toHaveLength(2);
    await pending;

    expect(store.getState().todos).toHaveLength(3);
    expect(store.getState().todos[2].text).toBe('third');
  });

  test('keeps initial actions synchronous while live actions stay async', async () => {
    const store = create<{ ping: () => string }>(
      () => ({
        ping() {
          return 'pong';
        }
      }),
      { worker: undefined }
    );

    const initialAction = store.getInitialState().ping;
    const liveAction = store.getState().ping;
    const initialResult: string = initialAction();
    const liveResult: Promise<string> = liveAction();

    expect(initialAction).not.toBe(liveAction);
    expect(initialResult).toBe('pong');
    await expect(liveResult).resolves.toBe('pong');
  });

  test('async actions already returning promises stay flattened', async () => {
    const store = create<{ load: () => Promise<number> }>(
      (set) => ({
        value: 0,
        async load() {
          await Promise.resolve();
          set((state: any) => {
            state.value = 42;
          });
          return 42;
        }
      }),
      { worker: undefined }
    );

    await expect(store.getState().load()).resolves.toBe(42);
    expect((store.getState() as any).value).toBe(42);
  });

  test('mutations are visible after awaiting actions', async () => {
    const store = createFallbackStore();

    await store.getState().toggleTodo('a');

    expect(store.getState().todos[0].completed).toBe(true);
    expect(store.getState().remaining).toBe(0);
  });

  test('computed state recomputes on the degraded store', async () => {
    const store = createFallbackStore();

    expect(store.getState().remaining).toBe(1);
    await store.getState().toggleTodo('a');
    expect(store.getState().remaining).toBe(0);
    await store.getState().addTodo('third');
    expect(store.getState().remaining).toBe(1);
  });

  test('action errors reject the returned promise', async () => {
    const store = createFallbackStore();

    await expect(store.getState().failTodo()).rejects.toThrow('boom');
  });

  test('enforces the shared JSON contract without a transport', async () => {
    expect(() =>
      create(
        () => ({
          value: new Map([['key', 'value']]),
          update() {}
        }),
        { worker: undefined }
      )
    ).toThrow('Non-plain object state');

    const store = create<{
      value: unknown;
      setRich: () => void;
      echo: (value: unknown) => unknown;
      getRich: () => unknown;
    }>(
      (set) => ({
        value: 'plain',
        setRich() {
          set((state) => {
            state.value = new Map([['key', 'value']]);
          });
        },
        echo(value) {
          return value;
        },
        getRich() {
          return new Map([['key', 'value']]);
        }
      }),
      { worker: undefined }
    );

    expect(() => store.getState().echo(new Map())).toThrow(
      'Non-plain object state'
    );
    await expect(store.getState().getRich()).rejects.toThrow(
      'Non-plain object state'
    );
    await expect(store.getState().setRich()).rejects.toThrow(
      'Non-plain object state'
    );
    expect(store.getState().value).toBe('plain');
    expect(() =>
      store.setState({ value: new Map([['key', 'value']]) })
    ).toThrow('Non-plain object state');
    expect(() =>
      store.apply({ value: new Map([['key', 'value']]) } as any)
    ).toThrow('Non-plain object state');
  });

  test('subscribers and immutable snapshots work like a local store', async () => {
    const store = createFallbackStore();
    const snapshots: number[] = [];
    const unsubscribe = store.subscribe(() => {
      snapshots.push(store.getState().remaining);
    });

    await store.getState().addTodo('third');

    expect(snapshots).toEqual([2]);
    unsubscribe();
  });

  test('works with slices mode one level deep', async () => {
    const store = create(
      {
        counter: (set: any) => ({
          count: 0,
          increment() {
            set((state: any) => {
              state.counter.count += 1;
            });
          }
        }),
        text: (set: any) => ({
          value: 'hello',
          upper() {
            return 'HELLO';
          }
        })
      },
      { sliceMode: 'slices', worker: undefined }
    );

    const pending = store.getState().counter.increment();
    expect(pending).toBeInstanceOf(Promise);
    await pending;

    expect(store.getState().counter.count).toBe(1);
    await expect(store.getState().text.upper()).resolves.toBe('HELLO');
  });

  test('keeps enablePatches validation consistent with client mode', () => {
    // `enablePatches` is a StoreOptions field; runtime validation still
    // guards the JS-only combination like it does for client stores.
    const options: any = {
      worker: undefined,
      enablePatches: false
    };
    expect(() => create<TodosState>(todosSlice, options)).toThrow(
      'enablePatches: true is required for the async store'
    );
  });

  test('clientTransport: undefined also degrades', async () => {
    const store = create<TodosState>(todosSlice, {
      clientTransport: undefined
    });

    await expect(store.getState().remaining).toBe(1);
    await store.getState().addTodo('third');
    expect(store.getState().todos).toHaveLength(3);
  });

  test('plain local stores are untouched without client options', () => {
    const store = create<TodosState>(todosSlice);

    const result = store.getState().addTodo('third');
    expect(result).toBeUndefined();
    expect(store.getState().todos).toHaveLength(3);
  });

  test('actions are usable through the store hook shape', async () => {
    const store = createFallbackStore() as unknown as AsyncStore<TodosState>;

    const state = store.getState();
    expect(typeof state.addTodo).toBe('function');
    await state.addTodo('third');
    expect(store.getState().todos).toHaveLength(3);
  });
});
