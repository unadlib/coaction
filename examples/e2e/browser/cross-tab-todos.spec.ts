import { expect, test, type Page } from '@playwright/test';

/**
 * Cross-tab todos e2e — the publicly reproducible proof that one SharedWorker
 * authority keeps every connected tab in sync.
 *
 * Run with: pnpm test:e2e:browser
 * Humans can reproduce the same scenario by opening
 * /examples/e2e/browser/todos/todos.html?name=demo in two tabs.
 */

const todosPath = (name: string) =>
  `/examples/e2e/browser/todos/todos.html?name=${encodeURIComponent(name)}`;

const createScenarioName = () =>
  `todos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const openTodos = async (page: Page, name: string) => {
  await page.goto(todosPath(name));
  await expect(page.getByTestId('mode')).toHaveText('SharedWorker');
  await expect(page.getByTestId('todo-item')).toHaveCount(3);
};

const addTodo = async (page: Page, text: string, via: 'enter' | 'button') => {
  await page.getByTestId('new-todo').fill(text);
  if (via === 'enter') {
    await page.getByTestId('new-todo').press('Enter');
  } else {
    await page.getByTestId('add-todo').click();
  }
};

const todoItem = (page: Page, text: string) =>
  page.getByRole('listitem', { name: text, exact: true });

const expectItemsLeft = async (page: Page, text: string | RegExp) => {
  await expect(page.getByTestId('items-left')).toHaveText(text);
};

test('two tabs stay in sync through the SharedWorker authority', async ({
  context
}) => {
  const name = createScenarioName();
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();

  const errors: string[] = [];
  for (const [label, page] of [
    ['tab1', tab1],
    ['tab2', tab2]
  ] as const) {
    page.on('pageerror', (error) => errors.push(`[${label}] ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(`[${label}] ${message.text()}`);
      }
    });
  }

  // 1-2. Both tabs connect to the same authority and share the seed state.
  await openTodos(tab1, name);
  await openTodos(tab2, name);

  // 3. Add in tab1 (Enter) — appears in tab2.
  await addTodo(tab1, 'buy milk', 'enter');
  await expect(todoItem(tab2, 'buy milk')).toBeVisible();

  // 4. Add in tab2 (button) — appears in tab1.
  await addTodo(tab2, 'write docs', 'button');
  await expect(todoItem(tab1, 'write docs')).toBeVisible();

  // 5. Toggle in tab2 — completion strikes through in tab1.
  await todoItem(tab2, 'buy milk').getByTestId('todo-checkbox').click();
  await expect(
    todoItem(tab1, 'buy milk').getByTestId('todo-label')
  ).toHaveClass(/completed/);

  // 6. Items-left counter reflects the shared state in both tabs.
  await expectItemsLeft(tab1, /^3 items left$/);
  await expectItemsLeft(tab2, /^3 items left$/);

  // 7. Edit in tab2 (double-click + Enter) — new text reaches tab1.
  await todoItem(tab2, 'write docs').getByTestId('todo-label').dblclick();
  await todoItem(tab2, 'write docs')
    .getByTestId('todo-edit')
    .fill('write the docs');
  await todoItem(tab2, 'write docs').getByTestId('todo-edit').press('Enter');
  await expect(todoItem(tab1, 'write the docs')).toBeVisible();

  // 8. Editing with Escape keeps the original text.
  await todoItem(tab1, 'write the docs').getByTestId('todo-label').dblclick();
  await todoItem(tab1, 'write the docs').getByTestId('todo-edit').fill('nope');
  await todoItem(tab1, 'write the docs')
    .getByTestId('todo-edit')
    .press('Escape');
  await expect(todoItem(tab1, 'write the docs')).toBeVisible();

  // 9. Filters apply in both tabs — including the filter itself.
  await tab1.getByTestId('filter-active').click();
  await expect(tab1.getByTestId('todo-item')).toHaveCount(3);
  await expect(tab2.getByTestId('filter-active')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(todoItem(tab1, 'buy milk')).toBeHidden();

  await tab1.getByTestId('filter-completed').click();
  await expect(tab1.getByTestId('todo-item')).toHaveCount(2);
  await expect(todoItem(tab1, 'buy milk')).toBeVisible();

  await tab1.getByTestId('filter-all').click();
  await expect(tab1.getByTestId('todo-item')).toHaveCount(5);

  // 10. Toggle-all in tab2 completes everything, mirrored in tab1.
  await tab2.getByTestId('toggle-all').click();
  await expectItemsLeft(tab1, /^0 items left$/);
  await expect(
    todoItem(tab1, 'write the docs').getByTestId('todo-label')
  ).toHaveClass(/completed/);

  // 11. Clear completed empties the list in both tabs.
  await tab1.getByTestId('clear-completed').click();
  await expect(tab1.getByTestId('empty-state')).toBeVisible();
  await expect(tab2.getByTestId('empty-state')).toBeVisible();
  await expect(tab2.getByTestId('todo-item')).toHaveCount(0);

  // 12. Delete in tab2 removes the row from tab1.
  await addTodo(tab1, 'temporary', 'enter');
  await expect(todoItem(tab2, 'temporary')).toBeVisible();
  await todoItem(tab2, 'temporary').getByTestId('todo-delete').click();
  await expect(todoItem(tab1, 'temporary')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('degrades to a local store when SharedWorker is unavailable', async ({
  context
}) => {
  // Simulate environments without SharedWorker (some private modes, webviews).
  await context.addInitScript(() => {
    Object.defineProperty(window, 'SharedWorker', {
      configurable: true,
      value: undefined
    });
  });
  const page = await context.newPage();

  await page.goto(todosPath(createScenarioName()));
  await expect(page.getByTestId('mode')).toHaveText('Local fallback');
  await expect(page.getByTestId('todo-item')).toHaveCount(3);

  // The degraded store keeps the async action contract: the same UI flow
  // works without any code changes.
  await addTodo(page, 'works without a worker too', 'enter');
  await expect(page.getByTestId('todo-item')).toHaveCount(4);
  await page.getByTestId('toggle-all').click();
  await expect(page.getByTestId('items-left')).toHaveText('0 items left');
  await page.getByTestId('clear-completed').click();
  await expect(page.getByTestId('empty-state')).toBeVisible();
});

test('preserves an in-progress edit while another tab updates', async ({
  context
}) => {
  const name = createScenarioName();
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  await openTodos(tab1, name);
  await openTodos(tab2, name);

  const original = 'Add a todo below';
  const draft = 'Keep this unsaved draft';
  await todoItem(tab1, original).getByTestId('todo-label').dblclick();
  const edit = tab1.getByTestId('todo-edit');
  await edit.fill(draft);
  await expect(edit).toBeFocused();

  await addTodo(tab2, 'remote update', 'enter');
  await expect(tab1.getByTestId('todo-item')).toHaveCount(4);
  await expect(edit).toHaveValue(draft);
  await expect(edit).toBeFocused();

  await edit.press('Enter');
  await expect(todoItem(tab2, draft)).toBeVisible();
});
