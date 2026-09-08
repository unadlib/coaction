import { endBatch, getActiveSub, signal, startBatch } from 'alien-signals';
import type { Patches } from 'mutative';
import type { CreateState } from './interface';
import type { Internal } from './internal';
import { sharedRegistry } from './sharedRegistry';

export type ReactivePath = readonly PropertyKey[];

export type ReactivePathNode = {
  children?: Map<PropertyKey, ReactivePathNode>;
  parent?: ReactivePathNode;
  key?: PropertyKey;
  valueVersion?: ReturnType<typeof signal<number>>;
  structureVersion?: ReturnType<typeof signal<number>>;
  valueTick: number;
  structureTick: number;
  valueSubscribers: number;
  structureSubscribers: number;
  valuePersistent?: boolean;
  structurePersistent?: boolean;
  owner: Internal<any>;
};

const VALUE_DEPENDENCY = 1;
const STRUCTURE_DEPENDENCY = 2;
const TERMINAL_DEPENDENCY = 4;
const COUNTED_DEPENDENCIES = VALUE_DEPENDENCY | STRUCTURE_DEPENDENCY;

type ReactiveSubscriberState = {
  current: Map<ReactivePathNode, number>;
  next?: Map<ReactivePathNode, number>;
};

// Shared across entry points; see sharedRegistry.ts.
const reactiveSubscribers = sharedRegistry.reactiveSubscribers as WeakMap<
  object,
  ReactiveSubscriberState
>;

const createNode = (
  owner: Internal<any>,
  parent?: ReactivePathNode,
  key?: PropertyKey
): ReactivePathNode => ({
  owner,
  parent,
  key,
  valueTick: 0,
  structureTick: 0,
  valueSubscribers: 0,
  structureSubscribers: 0
});

const normalizePointerSegment = (segment: string) =>
  segment.replace(/~1/g, '/').replace(/~0/g, '~');

export const normalizeReactivePath = (path: unknown): PropertyKey[] => {
  if (Array.isArray(path)) {
    return path.map((segment) =>
      typeof segment === 'number' ? String(segment) : (segment as PropertyKey)
    );
  }
  if (typeof path !== 'string') {
    return [];
  }
  if (path === '') {
    return [];
  }
  return path.split('/').slice(1).map(normalizePointerSegment);
};

const getRoot = <T extends CreateState>(
  internal: Internal<T>
): ReactivePathNode => (internal.reactivePathRoot ??= createNode(internal));

const getNode = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath,
  create: boolean
): ReactivePathNode | undefined => {
  const root = create ? getRoot(internal) : internal.reactivePathRoot;
  if (!root) {
    return undefined;
  }
  let node: ReactivePathNode = root;
  for (const segment of path) {
    let child: ReactivePathNode | undefined = node.children?.get(segment);
    if (!child) {
      if (!create) {
        return undefined;
      }
      child = createNode(internal, node, segment);
      (node.children ??= new Map()).set(segment, child);
    }
    node = child;
  }
  return node;
};

export const hasReactivePathNodes = <T extends CreateState>(
  internal: Internal<T>
) => Boolean(internal.reactivePathActiveCount);

/** Read the current semantic value version for an already-known path. */
export const getReactivePathVersion = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath
) => getNode(internal, path, false)?.valueTick ?? 0;

const hasActiveDependency = (node: ReactivePathNode) =>
  node.valueSubscribers > 0 ||
  node.structureSubscribers > 0 ||
  node.valuePersistent ||
  node.structurePersistent;

const pruneNode = (node: ReactivePathNode) => {
  if (hasActiveDependency(node) || node.children?.size) {
    return;
  }
  const parent = node.parent;
  if (!parent || typeof node.key === 'undefined') {
    return;
  }
  parent.children?.delete(node.key);
  if (parent.children?.size === 0) {
    parent.children = undefined;
  }
  node.valueVersion = undefined;
  node.structureVersion = undefined;
  pruneNode(parent);
};

const updateSubscriberCount = (
  node: ReactivePathNode,
  mask: number,
  delta: 1 | -1,
  shouldPrune = true
) => {
  if (mask & VALUE_DEPENDENCY) {
    node.valueSubscribers += delta;
  }
  if (mask & STRUCTURE_DEPENDENCY) {
    node.structureSubscribers += delta;
  }
  node.owner.reactivePathActiveCount = Math.max(
    0,
    (node.owner.reactivePathActiveCount ?? 0) +
      delta * Number(Boolean(mask & VALUE_DEPENDENCY)) +
      delta * Number(Boolean(mask & STRUCTURE_DEPENDENCY))
  );
  if (delta < 0 && shouldPrune) {
    pruneNode(node);
  }
};

const markPersistent = (node: ReactivePathNode, mask: number) => {
  if (mask & VALUE_DEPENDENCY && !node.valuePersistent) {
    node.valuePersistent = true;
    node.owner.reactivePathActiveCount =
      (node.owner.reactivePathActiveCount ?? 0) + 1;
  }
  if (mask & STRUCTURE_DEPENDENCY && !node.structurePersistent) {
    node.structurePersistent = true;
    node.owner.reactivePathActiveCount =
      (node.owner.reactivePathActiveCount ?? 0) + 1;
  }
};

const recordSubscriberDependency = (
  subscriber: object,
  node: ReactivePathNode,
  mask: number
) => {
  const state = reactiveSubscribers.get(subscriber);
  if (!state?.next) {
    markPersistent(node, mask & COUNTED_DEPENDENCIES);
    return;
  }
  state.next.set(node, (state.next.get(node) ?? 0) | mask);
};

const minimizeTrackedDependencies = (
  dependencies: Map<ReactivePathNode, number>
) => {
  // Object property access is initially provisional: it may be the terminal
  // value, or merely a step toward a deeper leaf. If the same evaluation
  // reaches a descendant, retain the deeper dependency and drop redundant
  // ancestor value subscriptions. Explicit terminal markers (selector return
  // values / React props) keep the ancestor when object identity is consumed.
  for (const [node, mask] of dependencies) {
    if (!(mask & COUNTED_DEPENDENCIES)) continue;
    let parent = node.parent;
    while (parent) {
      const parentMask = dependencies.get(parent);
      if (
        parentMask &&
        parentMask & VALUE_DEPENDENCY &&
        !(parentMask & TERMINAL_DEPENDENCY)
      ) {
        const nextMask = parentMask & ~VALUE_DEPENDENCY;
        if (nextMask & COUNTED_DEPENDENCIES) {
          dependencies.set(parent, nextMask);
        } else {
          dependencies.delete(parent);
        }
      }
      parent = parent.parent;
    }
  }
  for (const [node, mask] of dependencies) {
    let nextMask = mask;
    if (
      nextMask & VALUE_DEPENDENCY &&
      nextMask & STRUCTURE_DEPENDENCY &&
      !(nextMask & TERMINAL_DEPENDENCY)
    ) {
      nextMask &= ~VALUE_DEPENDENCY;
    }
    // Traversal candidates deliberately did not touch their signal while the
    // property chain was executing. Only candidates that survive minimization
    // are true terminal object dependencies; activate those links now while
    // the Coaction tracker is still the active alien-signals subscriber.
    if (nextMask & VALUE_DEPENDENCY && !(nextMask & TERMINAL_DEPENDENCY)) {
      (node.valueVersion ??= signal(node.valueTick))();
    }
    nextMask &= COUNTED_DEPENDENCIES;
    if (nextMask) dependencies.set(node, nextMask);
    else dependencies.delete(node);
  }
  return dependencies;
};

/** Register a Coaction-owned tracker so path-node lifetimes can be reclaimed. */
export const registerReactiveSubscriber = (subscriber: object) => {
  reactiveSubscribers.set(subscriber, { current: new Map() });
};

/** Begin collecting the exact path dependencies for one tracker evaluation. */
export const beginReactiveSubscriberTrack = (subscriber: object) => {
  const state = reactiveSubscribers.get(subscriber);
  if (state) {
    state.next = new Map();
  }
};

/** Reconcile tracker dependencies and prune nodes that are no longer used. */
export const endReactiveSubscriberTrack = (subscriber: object) => {
  const state = reactiveSubscribers.get(subscriber);
  const collected = state?.next;
  if (!state || !collected) {
    return;
  }
  const next = minimizeTrackedDependencies(collected);
  const removedNodes = new Set<ReactivePathNode>();
  for (const [node, currentMask] of state.current) {
    const nextMask = next.get(node) ?? 0;
    const removedMask = currentMask & ~nextMask;
    if (removedMask) {
      updateSubscriberCount(node, removedMask, -1, false);
      removedNodes.add(node);
    }
  }
  for (const [node, nextMask] of next) {
    const currentMask = state.current.get(node) ?? 0;
    const addedMask = nextMask & ~currentMask;
    if (addedMask) {
      updateSubscriberCount(node, addedMask, 1);
    }
  }
  removedNodes.forEach(pruneNode);
  state.current = next;
  state.next = undefined;
};

/** Release every path dependency owned by a disposed framework tracker. */
export const disposeReactiveSubscriber = (subscriber: object) => {
  const state = reactiveSubscribers.get(subscriber);
  if (!state) {
    return;
  }
  for (const [node, mask] of state.current) {
    updateSubscriberCount(node, mask, -1);
  }
  reactiveSubscribers.delete(subscriber);
};

/**
 * Whether a reactive subscriber is collecting dependencies right now.
 *
 * Reads outside a tracked scope -- action bodies, event handlers, a bare
 * `getState()` -- cannot record anything, so the public state proxy checks this
 * once per access and skips building child paths entirely rather than paying
 * for them and discarding the result inside each `track*` call.
 */
export const isReactiveTrackingActive = () => Boolean(getActiveSub());

export const trackReactivePath = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath
) => {
  const subscriber = getActiveSub() as object | undefined;
  if (!subscriber) {
    return;
  }
  const node = getNode(internal, path, true)!;
  recordSubscriberDependency(
    subscriber,
    node,
    VALUE_DEPENDENCY | TERMINAL_DEPENDENCY
  );
  (node.valueVersion ??= signal(node.valueTick))();
};

/**
 * Track an object/array access that may only be a traversal step. Coaction
 * trackers collapse it when a deeper dependency is read in the same pass.
 */
export const trackReactiveTraversalPath = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath
) => {
  const subscriber = getActiveSub() as object | undefined;
  if (!subscriber || !reactiveSubscribers.get(subscriber)?.next) {
    // Foreign subscribers have no finalization pass to distinguish traversal
    // from a returned object or an identity comparison. Keep the object path
    // conservatively; otherwise even computed(() => state.user) can go stale.
    trackReactivePath(internal, path);
    return;
  }
  const node = getNode(internal, path, true)!;
  recordSubscriberDependency(subscriber, node, VALUE_DEPENDENCY);
};

export const trackReactiveStructure = <T extends CreateState>(
  internal: Internal<T>,
  path: ReactivePath
) => {
  const subscriber = getActiveSub() as object | undefined;
  if (!subscriber) {
    return;
  }
  const node = getNode(internal, path, true)!;
  recordSubscriberDependency(subscriber, node, STRUCTURE_DEPENDENCY);
  (node.structureVersion ??= signal(node.structureTick))();
};

const invalidateNode = (node: ReactivePathNode, deep: boolean) => {
  if (node.valueVersion) {
    node.valueTick += 1;
    node.valueVersion(node.valueTick);
  }
  if (deep && node.structureVersion) {
    node.structureTick += 1;
    node.structureVersion(node.structureTick);
  }
  if (deep && node.children) {
    node.children.forEach((child) => invalidateNode(child, true));
  }
};

const invalidateValue = (node: ReactivePathNode | undefined) => {
  if (!node?.valueVersion) {
    return;
  }
  node.valueTick += 1;
  node.valueVersion(node.valueTick);
};

const invalidateStructure = (node: ReactivePathNode | undefined) => {
  if (!node?.structureVersion) {
    return;
  }
  node.structureTick += 1;
  node.structureVersion(node.structureTick);
};

const getValueAtPath = (root: unknown, path: readonly PropertyKey[]) => {
  let value = root as any;
  for (const segment of path) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[segment as any];
  }
  return value;
};

export const invalidateReactivePaths = <T extends CreateState>(
  internal: Internal<T>,
  patches?: Patches
) => {
  const root = internal.reactivePathRoot;
  if (!root) {
    return;
  }
  // `endBatch()` flushes subscribers synchronously, and they read the store
  // while they run. Every caller has already committed the new root state, so
  // the batch is over as far as readers are concerned: left set, `isBatching`
  // makes the public state hand out raw objects instead of tracked readonly
  // proxies, so a subscriber re-reading its selector would get an untracked
  // value that no longer compares equal to the one it rendered.
  const wasBatching = internal.isBatching;
  internal.isBatching = false;
  startBatch();
  try {
    if (!patches) {
      invalidateNode(root, true);
      return;
    }
    for (const patch of patches) {
      const path = normalizeReactivePath(patch.path);
      if (!path.length) {
        invalidateNode(root, true);
        continue;
      }
      // A selector that returns the complete public state facade tracks the
      // root value. Any non-root patch changes that aggregate value.
      invalidateValue(root);
      // Coarse object-valued reads (used by computed getters returning or
      // traversing frozen snapshots) subscribe to an ancestor value node.
      // Notify those ancestors without invalidating sibling descendants.
      for (let depth = 1; depth < path.length; depth += 1) {
        invalidateValue(getNode(internal, path.slice(0, depth), false));
      }
      const node = getNode(internal, path, false);
      if (node) {
        invalidateNode(node, true);
      }

      const parentPath = path.slice(0, -1);
      const parentNode = getNode(internal, parentPath, false);
      if (patch.op === 'add' || patch.op === 'remove') {
        invalidateStructure(parentNode);
      }

      // Array insertions/removals shift only indexes at or after the changed
      // position. Preserve dependencies on stable earlier indexes.
      const parentValue = getValueAtPath(internal.rootState, parentPath);
      const lastSegment = path[path.length - 1];
      const arrayIndex =
        typeof lastSegment === 'string' && /^(0|[1-9]\d*)$/.test(lastSegment)
          ? Number(lastSegment)
          : undefined;
      // Shortening an array through `length` drops elements without a patch
      // per index, so the indexes it removed are invalidated here. `rootState`
      // already holds the new value, so its length is the surviving count.
      if (
        lastSegment === 'length' &&
        patch.op === 'replace' &&
        Array.isArray(parentValue) &&
        parentNode
      ) {
        const survivors = parentValue.length;
        invalidateStructure(parentNode);
        for (const [key, child] of parentNode.children ?? []) {
          if (
            typeof key === 'string' &&
            /^(0|[1-9]\d*)$/.test(key) &&
            Number(key) >= survivors
          ) {
            invalidateNode(child, true);
          }
        }
      }

      if (
        Array.isArray(parentValue) &&
        parentNode &&
        (patch.op === 'add' || patch.op === 'remove') &&
        typeof arrayIndex === 'number'
      ) {
        invalidateValue(parentNode.children?.get('length'));
        for (const [key, child] of parentNode.children ?? []) {
          if (
            typeof key === 'string' &&
            /^(0|[1-9]\d*)$/.test(key) &&
            Number(key) > arrayIndex
          ) {
            invalidateNode(child, true);
          }
        }
      }
    }
  } finally {
    endBatch();
    internal.isBatching = wasBatching;
  }
};
