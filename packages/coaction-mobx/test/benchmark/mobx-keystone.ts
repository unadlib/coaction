import { computed, makeObservable, observable } from 'mobx';
import {
  idProp,
  model,
  Model,
  modelAction,
  prop,
  Ref,
  rootRef,
  registerRootStore
} from 'mobx-keystone';
// https://github.com/xaviergonz/mobx-keystone/issues/503

export const createMobxKeystoneStore = () => {
  const categoryRef = rootRef<TodoCategory>('myCoolApp/categoryRef');

  @model('myCoolApp/Cateogry')
  class TodoCategory extends Model({
    id: idProp,
    text: prop<string>('category')
  }) {}

  @model('myCoolApp/Todo')
  class Todo extends Model({
    id: idProp,
    text: prop<string>('todo'),
    done: prop(false),
    categoryRef: prop<Ref<TodoCategory> | undefined>()
  }) {}

  @model('myCoolApp/TodoStore')
  class Store extends Model({
    categories: prop<TodoCategory[]>(() => []),
    todos: prop<Todo[]>(() => [])
  }) {
    @modelAction
    reset() {
      this.categories = [];
      this.todos = [];
    }

    @modelAction
    bigInitWithoutRefsWithoutAssign() {
      const todos: Todo[] = [];
      for (let i = 0; i < 10_000; i++) {
        todos.push(new Todo({ text: '' }));
      }
    }

    @modelAction
    bigInitWithoutRefsWithAssign() {
      const todos: Todo[] = [];
      for (let i = 0; i < 10_000; i++) {
        todos.push(new Todo({ text: '' }));
      }
      this.todos = [...this.todos, ...todos];
    }

    @modelAction
    bigInitWithRefsWithoutAssign() {
      const category = new TodoCategory({});
      const todos: Todo[] = [];
      for (let i = 0; i < 10_000; i++) {
        todos.push(new Todo({ text: '', categoryRef: categoryRef(category) }));
      }
    }

    @modelAction
    bigInitWithRefsWithAssign() {
      const category = new TodoCategory({});
      this.categories.push(category);

      const todos: Todo[] = [];
      for (let i = 0; i < 10_000; i++) {
        todos.push(new Todo({ text: '', categoryRef: categoryRef(category) }));
      }
      this.todos = [...this.todos, ...todos];
    }

    init() {
      const todos: { text: string }[] = [];
      for (let i = 0; i < 10_000; i++) {
        todos.push(observable({ text: '' }));
      }
    }
  }

  const store = new Store({});
  registerRootStore(store);

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
