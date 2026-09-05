import type { Patches } from './patch';

/**
 * A copy-on-write draft over the tree a Coaction patch can describe.
 *
 * Writing state as mutation and publishing it as immutable is the library's
 * authoring model, and the general-purpose libraries that provide it carry
 * support for `Map`, `Set`, class instances and custom immutability marks --
 * none of which a Coaction transition can describe anyway, since `patch.ts`
 * narrows the tree to plain objects and dense arrays. Over that domain the
 * mechanism is small: copy a node the first time it is written, link the copy
 * into its parent's copy, and record the patch as it happens.
 *
 * Nothing is copied until it is written to, so an untouched branch keeps its
 * identity and the cost is the size of what changed.
 */
const draftState = Symbol('coaction.draft');

type Node = {
  base: Record<PropertyKey, unknown>;
  copy: Record<PropertyKey, unknown> | null;
  parent: Node | null;
  key: string | number | null;
  children: Map<string | number, Node>;
  proxy: unknown;
  root: Root;
};

type Root = {
  patches: Patches;
  inversePatches: Patches;
  finalized: boolean;
};

const isTraversable = (value: unknown) => {
  if (Array.isArray(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const pathOf = (node: Node): (string | number)[] => {
  const path: (string | number)[] = [];
  let current: Node | null = node;
  while (current?.parent) {
    path.unshift(current.key as string | number);
    current = current.parent;
  }
  return path;
};

/** The node's writable copy, creating it and its ancestors' copies on demand. */
const ensureCopy = (node: Node): Record<PropertyKey, unknown> => {
  if (node.copy) return node.copy;
  node.copy = Array.isArray(node.base)
    ? ((node.base as unknown[]).slice() as unknown as Record<
        PropertyKey,
        unknown
      >)
    : { ...node.base };
  if (node.parent) {
    ensureCopy(node.parent)[node.key as PropertyKey] = node.copy;
  }
  return node.copy;
};

const current = (node: Node) => node.copy ?? node.base;

const record = (
  node: Node,
  key: string | number,
  op: 'add' | 'remove' | 'replace',
  hadKey: boolean,
  previous: unknown,
  next: unknown
) => {
  const path = [...pathOf(node), key];
  const { patches, inversePatches } = node.root;
  if (op === 'remove') {
    patches.push({ op: 'remove', path });
    inversePatches.unshift({ op: 'add', path, value: previous });
    return;
  }
  patches.push({ op: hadKey ? 'replace' : 'add', path, value: next });
  inversePatches.unshift(
    hadKey ? { op: 'replace', path, value: previous } : { op: 'remove', path }
  );
};

const childNode = (node: Node, key: string | number, value: object): Node => {
  const existing = node.children.get(key);
  if (existing && existing.base === value) return existing;
  const child = createNode(
    value as Record<PropertyKey, unknown>,
    node,
    key,
    node.root
  );
  node.children.set(key, child);
  return child;
};

const createNode = (
  base: Record<PropertyKey, unknown>,
  parent: Node | null,
  key: string | number | null,
  root: Root
): Node => {
  const node: Node = {
    base,
    copy: null,
    parent,
    key,
    children: new Map(),
    proxy: undefined,
    root
  };
  node.proxy = new Proxy(base, {
    get(_target, property, receiver) {
      if (property === draftState) return node;
      const source = current(node);
      const value = Reflect.get(source, property, receiver);
      if (typeof property === 'symbol' || !isTraversable(value)) return value;
      // Arrays report `length` and index keys; only real containers descend.
      return childNode(node, property as string, value as object).proxy;
    },
    set(_target, property, value) {
      if (typeof property === 'symbol') {
        ensureCopy(node)[property] = value;
        return true;
      }
      const source = current(node);
      const hadKey = Object.prototype.hasOwnProperty.call(source, property);
      const previous = (source as Record<PropertyKey, unknown>)[property];
      const nextValue = unwrapDraft(value);
      if (hadKey && Object.is(previous, nextValue)) return true;
      const copy = ensureCopy(node);
      copy[property] = nextValue;
      node.children.delete(property as string);
      // `length` on an array is a truncation or an extension, not a field.
      if (Array.isArray(copy) && property === 'length') {
        node.root.patches.push({
          op: 'replace',
          path: [...pathOf(node), 'length'],
          value: nextValue
        });
        node.root.inversePatches.unshift({
          op: 'replace',
          path: pathOf(node),
          value: source
        });
        return true;
      }
      record(node, property as string, 'replace', hadKey, previous, nextValue);
      return true;
    },
    deleteProperty(_target, property) {
      if (typeof property === 'symbol') {
        delete ensureCopy(node)[property];
        return true;
      }
      const source = current(node);
      if (!Object.prototype.hasOwnProperty.call(source, property)) return true;
      const previous = (source as Record<PropertyKey, unknown>)[property];
      const copy = ensureCopy(node);
      delete copy[property];
      node.children.delete(property as string);
      record(node, property as string, 'remove', true, previous, undefined);
      return true;
    },
    has: (_target, property) => Reflect.has(current(node) as object, property),
    ownKeys: () => Reflect.ownKeys(current(node) as object),
    getOwnPropertyDescriptor: (_target, property) =>
      Reflect.getOwnPropertyDescriptor(current(node) as object, property),
    getPrototypeOf: () => Object.getPrototypeOf(current(node) as object)
  });
  return node;
};

const unwrapDraft = (value: unknown): unknown => {
  const node = getNode(value);
  return node ? finalizeNode(node) : value;
};

const getNode = (value: unknown): Node | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<symbol, Node | undefined>)[draftState];
};

const finalizeNode = (node: Node): unknown => node.copy ?? node.base;

export const isCoactionDraft = (value: unknown) => Boolean(getNode(value));

/**
 * Open a draft that is written over time and finalized later, which is what an
 * asynchronous action needs: the draft outlives the call that made it.
 */
export const openDraft = <T extends object>(
  base: T
): [draft: T, finalize: () => [T, Patches, Patches]] => {
  const root: Root = { patches: [], inversePatches: [], finalized: false };
  const node = createNode(
    base as Record<PropertyKey, unknown>,
    null,
    null,
    root
  );
  const finalize = (): [T, Patches, Patches] => {
    root.finalized = true;
    return [(node.copy ?? node.base) as T, root.patches, root.inversePatches];
  };
  return [node.proxy as T, finalize];
};

/** Run a recipe against a draft of `base` and report the transition it made. */
export const scopeDraft = <T extends object>(
  base: T,
  recipe: (draft: T) => unknown
): { state: T; result: unknown; patches: Patches; inversePatches: Patches } => {
  const [draft, finalize] = openDraft(base);
  const result = recipe(draft);
  const [state, patches, inversePatches] = finalize();
  return { state, result, patches, inversePatches };
};
