import { create } from 'coaction';

export const createCoactionStore = () => {
  const useStore = create(
    (set, get, store) => ({
      categories: [] as {
        id: number;
        text: string;
      }[],
      todos: [] as {
        text: string;
        done?: boolean;
        category?: {
          id: number;
          text: string;
        };
      }[],

      reset() {
        set(() => {
          this.categories = [];
          this.todos = [];
        });
      },

      bigInitWithoutRefsWithoutAssign() {
        set(() => {
          const todos = [];
          for (let i = 0; i < 10_000; i++) {
            todos.push({ text: '', done: false });
          }
          this.todos = todos;
        });
      },

      bigInitWithoutRefsWithAssign() {
        const todos = [];
        for (let i = 0; i < 10_000; i++) {
          todos.push({ text: '', done: false });
        }
        const newTodos = [...this.todos, ...todos];
        set(() => {
          this.todos = newTodos;
        });
      },

      bigInitWithRefsWithoutAssign() {
        set(() => {
          const category = { id: this.categories.length, text: 'category' };
          const todos = [];
          for (let i = 0; i < 10_000; i++) {
            todos.push({ text: '', done: false, category });
          }
          this.todos = todos;
        });
      },

      bigInitWithRefsWithAssign() {
        const category = { id: this.categories.length, text: 'category' };
        set(() => {
          this.categories.push(category);
        });

        const todos = [];
        for (let i = 0; i < 10_000; i++) {
          todos.push({ text: '', done: false, category });
        }
        const newTodos = [...this.todos, ...todos];
        set(() => {
          this.todos = newTodos;
        });
      },

      init() {
        set(() => {
          const todos = [];
          for (let i = 0; i < 10_000; i++) {
            todos.push({ text: '' });
          }
          this.todos = todos;
        });
      }
    }),
    {
      enablePatches: false
    }
  );

  const store = useStore();

  store.reset();
  return store;
};

// console.time('bigInitWithoutRefsWithoutAssign');
// store.bigInitWithoutRefsWithoutAssign();
// console.timeEnd('bigInitWithoutRefsWithoutAssign');

// store.reset();

// console.time('bigInitWithoutRefsWithAssign');
// store.bigInitWithoutRefsWithAssign();
// console.timeEnd('bigInitWithoutRefsWithAssign');

// store.reset();

// console.time('bigInitWithRefsWithoutAssign');
// store.bigInitWithRefsWithoutAssign();
// console.timeEnd('bigInitWithRefsWithoutAssign');

// store.reset();

// console.time('bigInitWithRefsWithoutAssign');
// store.bigInitWithRefsWithoutAssign();
// console.timeEnd('bigInitWithRefsWithoutAssign');

// store.reset();

// console.time('mobxInit');
// store.mobxInit();
// console.timeEnd('mobxInit');

// store.reset();
