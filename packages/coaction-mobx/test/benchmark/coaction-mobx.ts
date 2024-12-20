import { create } from 'coaction';
import { bindMobx } from '@coaction/mobx';
import { makeAutoObservable } from 'mobx';

export const createCoactionMobxStore = () => {
  const useStore = create(
    (set, get, store) =>
      makeAutoObservable(
        bindMobx({
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
            this.categories = [];
            this.todos = [];
          },

          bigInitWithoutRefsWithoutAssign() {
            const todos = [];
            for (let i = 0; i < 10_000; i++) {
              todos.push({ text: '', done: false });
            }
            this.todos = todos;
          },

          bigInitWithoutRefsWithAssign() {
            const todos = [];
            for (let i = 0; i < 10_000; i++) {
              todos.push({ text: '', done: false });
            }
            this.todos = [...this.todos, ...todos];
          },

          bigInitWithRefsWithoutAssign() {
            const category = { id: this.categories.length, text: 'category' };
            const todos = [];
            for (let i = 0; i < 10_000; i++) {
              todos.push({ text: '', done: false, category });
            }
            this.todos = todos;
          },

          bigInitWithRefsWithAssign() {
            const category = { id: this.categories.length, text: 'category' };
            this.categories.push(category);

            const todos = [];
            for (let i = 0; i < 10_000; i++) {
              todos.push({ text: '', done: false, category });
            }
            this.todos = [...this.todos, ...todos];
          },

          init() {
            const todos = [];
            for (let i = 0; i < 10_000; i++) {
              todos.push({ text: '' });
            }
            this.todos = todos;
          }
        })
      ),
    {
      enablePatches: true
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
