import { create } from '../../../../packages/core/src/index';

import {
  getStoreName,
  todosSlice,
  type Todo,
  type TodosState
} from './todosSlice';
import './todos.css';

const name = getStoreName();

/**
 * Cross-tab todos — one authority, many mirrors.
 *
 * With SharedWorker support every tab connects as a client mirror. Without
 * it, `worker: undefined` degrades to a local store whose actions still
 * return promises: the same call sites, one code path.
 */
const worker =
  typeof SharedWorker !== 'undefined'
    ? new SharedWorker(
        (() => {
          const url = new URL('./todos.worker.ts', import.meta.url);
          url.searchParams.set('name', name);
          return url;
        })(),
        { type: 'module', name }
      )
    : undefined;

const store = create<TodosState>(todosSlice, { name, worker });

const app = document.getElementById('app')!;

const renderStatic = () => {
  app.innerHTML = `
    <div class="shell">
      <header class="header">
        <h1>todos</h1>
        <p class="subtitle">
          coaction · SharedWorker authority
          <span class="badge" data-testid="mode"></span>
        </p>
        <button class="link" data-testid="open-tab" type="button">Open another tab</button>
      </header>
      <section class="panel">
        <form class="add" data-testid="add-form">
          <button class="icon" type="button" data-testid="toggle-all" title="Toggle all todos" aria-label="Toggle all todos">⌄</button>
          <input data-testid="new-todo" type="text" placeholder="What needs to be done?" aria-label="New todo" autocomplete="off" />
          <button class="add-button" type="submit" data-testid="add-todo">Add</button>
        </form>
        <ul class="list" data-testid="todo-list"></ul>
        <p class="empty" data-testid="empty-state" hidden></p>
        <footer class="footer" data-testid="footer" hidden>
          <span data-testid="items-left"></span>
          <div class="filters" role="group" aria-label="Filter todos">
            <button type="button" data-testid="filter-all" aria-pressed="false">All</button>
            <button type="button" data-testid="filter-active" aria-pressed="false">Active</button>
            <button type="button" data-testid="filter-completed" aria-pressed="false">Completed</button>
          </div>
          <button class="link" type="button" data-testid="clear-completed">Clear completed</button>
        </footer>
      </section>
      <p class="note">
        State lives in a SharedWorker and is mirrored to every connected tab —
        edit todos in two windows and watch them stay in sync.
      </p>
    </div>
  `;
};

/** Id of the todo currently being edited, if any. */
let editingId: string | null = null;

const todoRow = (todo: Todo) => {
  const li = document.createElement('li');
  li.className = 'todo';
  li.dataset.testid = 'todo-item';
  li.dataset.todoId = todo.id;
  li.setAttribute('aria-label', todo.text);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.testid = 'todo-checkbox';
  checkbox.checked = todo.completed;
  checkbox.setAttribute(
    'aria-label',
    `Mark "${todo.text}" as ${todo.completed ? 'active' : 'completed'}`
  );
  checkbox.addEventListener('change', () => {
    void store.getState().toggleTodo(todo.id);
  });

  const label = document.createElement('span');
  label.dataset.testid = 'todo-label';
  label.textContent = todo.text;
  label.className = todo.completed ? 'label completed' : 'label';
  label.title = todo.text;
  label.addEventListener('dblclick', () => {
    editingId = todo.id;
    render();
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon danger';
  remove.dataset.testid = 'todo-delete';
  remove.setAttribute('aria-label', `Delete "${todo.text}"`);
  remove.textContent = '×';
  remove.addEventListener('click', () => {
    void store.getState().removeTodo(todo.id);
  });

  li.append(checkbox, label, remove);
  return li;
};

const editRow = (todo: Todo) => {
  const li = document.createElement('li');
  li.className = 'todo editing';
  li.dataset.testid = 'todo-item';
  li.dataset.todoId = todo.id;
  li.setAttribute('aria-label', todo.text);

  const input = document.createElement('input');
  input.type = 'text';
  input.dataset.testid = 'todo-edit';
  input.setAttribute('aria-label', 'Edit todo');
  input.value = todo.text;
  const commit = () => {
    if (editingId !== todo.id) {
      return;
    }
    editingId = null;
    void store.getState().updateTodo(todo.id, input.value);
  };
  const cancel = () => {
    if (editingId !== todo.id) {
      return;
    }
    editingId = null;
    render();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  });

  li.append(input);
  const focus = () => {
    input.focus();
    input.select();
  };
  requestAnimationFrame(focus);
  return li;
};

const render = () => {
  const state = store.getState();

  const mode = app.querySelector<HTMLElement>('[data-testid="mode"]')!;
  mode.textContent = worker ? 'SharedWorker' : 'Local fallback';
  mode.className = worker ? 'badge ok' : 'badge warn';

  const list = app.querySelector<HTMLElement>('[data-testid="todo-list"]')!;
  const visibleEditingTodo = state.visibleTodos.find(
    (todo) => todo.id === editingId
  );
  if (editingId && !visibleEditingTodo) {
    editingId = null;
  }
  const activeEditRow = Array.from(list.children).find(
    (row) =>
      row instanceof HTMLElement &&
      row.dataset.todoId === editingId &&
      row.classList.contains('editing')
  );
  const rows = state.visibleTodos.map((todo) => {
    if (editingId === todo.id && activeEditRow instanceof HTMLElement) {
      activeEditRow.setAttribute('aria-label', todo.text);
      return activeEditRow;
    }
    return editingId === todo.id ? editRow(todo) : todoRow(todo);
  });
  rows.forEach((row, index) => {
    const current = list.children.item(index);
    if (current !== row) {
      list.insertBefore(row, current);
    }
  });
  while (list.children.length > rows.length) {
    list.lastElementChild?.remove();
  }

  const empty = app.querySelector<HTMLElement>('[data-testid="empty-state"]')!;
  empty.hidden = state.visibleTodos.length > 0;
  empty.textContent =
    state.todos.length === 0
      ? 'Nothing here yet — add your first todo above.'
      : state.filter === 'active'
        ? 'No active todos. Nice work!'
        : 'No completed todos yet.';

  const footer = app.querySelector<HTMLElement>('[data-testid="footer"]')!;
  footer.hidden = state.todos.length === 0;

  const itemsLeft = app.querySelector('[data-testid="items-left"]')!;
  itemsLeft.textContent = `${state.remaining} ${
    state.remaining === 1 ? 'item' : 'items'
  } left`;

  for (const filter of ['all', 'active', 'completed'] as const) {
    const button = app.querySelector<HTMLButtonElement>(
      `[data-testid="filter-${filter}"]`
    )!;
    button.setAttribute('aria-pressed', String(state.filter === filter));
    button.classList.toggle('active', state.filter === filter);
    button.onclick = () => {
      void store.getState().setFilter(filter);
    };
  }

  const toggleAll = app.querySelector<HTMLButtonElement>(
    '[data-testid="toggle-all"]'
  )!;
  toggleAll.disabled = state.todos.length === 0;
  toggleAll.classList.toggle('done', state.allCompleted);

  const clear = app.querySelector<HTMLButtonElement>(
    '[data-testid="clear-completed"]'
  )!;
  clear.toggleAttribute('disabled', state.completedCount === 0);
};

renderStatic();
render();
store.subscribe(render);

app
  .querySelector<HTMLFormElement>('[data-testid="add-form"]')!
  .addEventListener('submit', (event) => {
    event.preventDefault();
    const input = app.querySelector<HTMLInputElement>(
      '[data-testid="new-todo"]'
    )!;
    if (!input.value.trim()) {
      return;
    }
    void store.getState().addTodo(input.value);
    input.value = '';
    input.focus();
  });

app
  .querySelector<HTMLButtonElement>('[data-testid="toggle-all"]')!
  .addEventListener('click', () => {
    void store.getState().toggleAll();
  });

app
  .querySelector<HTMLButtonElement>('[data-testid="clear-completed"]')!
  .addEventListener('click', () => {
    void store.getState().clearCompleted();
  });

app
  .querySelector<HTMLButtonElement>('[data-testid="open-tab"]')!
  .addEventListener('click', () => {
    window.open(window.location.href, '_blank');
  });
