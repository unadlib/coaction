import { normalizePatchPath } from './paths';
import type { Patches, SyncMutation } from './types';

type Node = {
  id: symbol;
  children?: Node[] | Map<PropertyKey, Node>;
};
type Change = {
  patch: Patches[number];
  path: PropertyKey[];
  value?: Node;
  before?: symbol[];
};

const child = (node: Node, key: PropertyKey) =>
  Array.isArray(node.children)
    ? node.children[Number(key)]
    : node.children?.get(key);

const tree = (value: unknown, previous?: Node): Node => ({
  id: previous?.id ?? Symbol(),
  children: Array.isArray(value)
    ? value.map((item, index) => tree(item, previous && child(previous, index)))
    : value !== null && typeof value === 'object'
      ? new Map(
          Object.entries(value).map(([key, item]) => [
            key,
            tree(item, previous && child(previous, key))
          ])
        )
      : undefined
});

/** Render a stable array-slot path against the current tree. Path copying keeps
 * a rejected mutation from changing the coordinates of later mutations.
 */
const apply = (root: Node, change: Change) => {
  const path: PropertyKey[] = [];
  const visit = (node: Node, depth: number): Node => {
    if (depth === change.path.length) return change.value!;
    const children = node.children;
    if (!children) throw new Error('the parent no longer exists');
    const array = Array.isArray(children);
    const last = depth === change.path.length - 1;
    const key = change.path[depth];
    let target: PropertyKey = key;
    if (array) {
      target = children.findIndex(({ id }) => id === key);
      if (last && change.before) {
        // Insert before the first surviving successor. Concurrent remote
        // insertions stay before this local insertion at the same boundary.
        target = children.length;
        for (const id of change.before) {
          const index = children.findIndex((node) => node.id === id);
          if (index >= 0) {
            target = index;
            break;
          }
        }
      }
      if (Number(target) < 0)
        throw new Error('the array entry was removed by the remote');
    }
    path.push(target);
    const next = array ? children.slice() : new Map(children);
    const value = last ? change.value : visit(child(node, target)!, depth + 1);
    if (Array.isArray(next)) {
      if (last && change.patch.op !== 'replace')
        next.splice(
          Number(target),
          change.patch.op === 'remove' ? 1 : 0,
          ...(value ? [value] : [])
        );
      else next[Number(target)] = value!;
    } else if (last && change.patch.op === 'remove') next.delete(target);
    else next.set(target, value!);
    return { ...node, children: next };
  };
  return {
    root: visit(root, 0),
    patch: { ...change.patch, path } as Patches[number]
  };
};

/** Interpret each patch in the state produced by its predecessors. Symbols
 * identify array slots for this rebase only; persisted/wire patches stay JSON.
 * Replacing a slot preserves its positional identity, while add/remove creates
 * or removes one. No record IDs or equality heuristics are inferred from data.
 */
const record = (
  root: Node,
  patch: Patches[number]
): { root: Node; changes: Change[] } => {
  const path = normalizePatchPath(patch.path);
  const semantic: PropertyKey[] = [];
  let parent = root;
  for (const key of path.slice(0, -1)) {
    const next = child(parent, key)!;
    semantic.push(Array.isArray(parent.children) ? next.id : key);
    parent = next;
  }
  const key = path[path.length - 1];
  const items = parent.children;
  if (Array.isArray(items) && key === 'length') {
    const changes: Change[] = [];
    // A truncation removes the original tail, without deleting entries the
    // remote inserted meanwhile or assigning a now-stale absolute length.
    for (let index = items.length - 1; index >= Number(patch.value); index--) {
      const result = record(root, {
        op: 'remove',
        path: [...(path.slice(0, -1) as (string | number)[]), index]
      });
      root = result.root;
      changes.push(...result.changes);
    }
    return { root, changes };
  }
  const insertion = Array.isArray(items) && patch.op === 'add';
  const index =
    key === '-' && Array.isArray(items) ? items.length : Number(key);
  const previous = path.length ? child(parent, key) : root;
  const value =
    patch.op === 'remove'
      ? undefined
      : tree(patch.value, patch.op === 'replace' ? previous : undefined);
  if (path.length)
    semantic.push(
      Array.isArray(items) ? (insertion ? value!.id : previous!.id) : key
    );
  const change: Change = {
    patch,
    path: semantic,
    value,
    before: insertion ? items.slice(index).map(({ id }) => id) : undefined
  };
  return { root: apply(root, change).root, changes: [change] };
};

const overlap = (a: PropertyKey[], b: PropertyKey[]) =>
  a
    .slice(0, Math.min(a.length, b.length))
    .every((key, index) => key === b[index]);

/** Keep local and remote coordinates independent until conflict resolution. */
export const createRebasePaths = (base: unknown, patches: Patches) => {
  let local = tree(base);
  let rebased = local;
  const remote = patches.map((patch) => {
    const result = record(rebased, patch);
    rebased = result.root;
    return { patch, changes: result.changes };
  });
  return (mutation: SyncMutation) => {
    const changes = mutation.patches.flatMap((patch) => {
      const result = record(local, patch);
      local = result.root;
      return result.changes;
    });
    return {
      overlapping: remote
        .filter((entry) =>
          entry.changes.some((remote) =>
            changes.some((local) => overlap(local.path, remote.path))
          )
        )
        .map(({ patch }) => patch),
      replay: () => {
        let next = rebased;
        const translated = changes.map((change) => {
          const result = apply(next, change);
          next = result.root;
          return result.patch;
        });
        rebased = next;
        return { ...mutation, patches: translated };
      }
    };
  };
};
