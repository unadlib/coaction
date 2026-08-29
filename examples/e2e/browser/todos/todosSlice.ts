import { create, type Slice } from '../../../../packages/core/src/index';

export type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

export type TodoFilter = 'all' | 'active' | 'completed';

export type TodosState = {
  todos: Todo[];
  filter: TodoFilter;
  remaining: number;
  completedCount: number;
  allCompleted: boolean;
  visibleTodos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  updateTodo: (id: string, text: string) => void;
  removeTodo: (id: string) => void;
  toggleAll: () => void;
  clearCompleted: () => void;
  setFilter: (filter: TodoFilter) => void;
};

let seed = 0;

const createTodo = (text: string, completed = false): Todo => ({
  id: `todo-${Date.now().toString(36)}-${(seed += 1)}`,
  text,
  completed
});

/**
 * The single store definition shared by both runtimes:
 *
 * - the SharedWorker instantiates it as the write authority;
 * - every browser tab instantiates it as a mirrored client.
 *
 * Everything that crosses the boundary stays JSON-serializable.
 */
export const todosSlice: Slice<TodosState> = (set, get) => ({
  todos: [
    createTodo('Add a todo below', true),
    createTodo('Open a second tab — state stays in sync'),
    createTodo('Double-click any todo to edit it')
  ],
  filter: 'all',

  remaining: get(
    (state) => [state.todos],
    (todos) => todos.filter((todo) => !todo.completed).length
  ),

  completedCount: get(
    (state) => [state.todos],
    (todos) => todos.filter((todo) => todo.completed).length
  ),

  allCompleted: get(
    (state) => [state.todos],
    (todos) => todos.length > 0 && todos.every((todo) => todo.completed)
  ),

  visibleTodos: get(
    (state) => [state.todos, state.filter],
    (todos, filter) => {
      switch (filter) {
        case 'active':
          return todos.filter((todo) => !todo.completed);
        case 'completed':
          return todos.filter((todo) => todo.completed);
        default:
          return todos;
      }
    }
  ),

  addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    set((state) => {
      state.todos.push(createTodo(trimmed));
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

  updateTodo(id, text) {
    const trimmed = text.trim();
    set((state) => {
      const todo = state.todos.find((todo) => todo.id === id);
      if (!todo) {
        return;
      }
      if (trimmed) {
        todo.text = trimmed;
      } else {
        state.todos = state.todos.filter((todo) => todo.id !== id);
      }
    });
  },

  removeTodo(id) {
    set((state) => {
      state.todos = state.todos.filter((todo) => todo.id !== id);
    });
  },

  toggleAll() {
    set((state) => {
      const makeCompleted = state.todos.some((todo) => !todo.completed);
      state.todos.forEach((todo) => {
        todo.completed = makeCompleted;
      });
    });
  },

  clearCompleted() {
    set((state) => {
      state.todos = state.todos.filter((todo) => !todo.completed);
    });
  },

  setFilter(filter) {
    set((state) => {
      state.filter = filter;
    });
  }
});

/** Read the per-scenario store name so parallel tests stay isolated. */
export const getStoreName = () => {
  const url = new URL(globalThis.location.href);
  return url.searchParams.get('name') ?? 'coaction-todos';
};

export const createAuthorityStore = () =>
  create<TodosState>(todosSlice, { name: getStoreName() });
