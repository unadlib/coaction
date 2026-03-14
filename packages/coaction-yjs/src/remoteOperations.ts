import * as Y from 'yjs';
import { clone } from './shared';
import { toPlainValue } from './yjsValue';

export type PathSegment = string | number;

export type RemoteOperation =
  | {
      type: 'set';
      path: PathSegment[];
      value: unknown;
    }
  | {
      type: 'delete';
      path: PathSegment[];
    };

export function isSetStateReentryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'setState cannot be called within the updater'
  );
}

function cloneForStore<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    return clone(value);
  }
  return value;
}

function toPathKey(path: PathSegment[]): string {
  return path
    .map((segment) => `${typeof segment}:${String(segment)}`)
    .join('|');
}

export function compactOperations(
  operations: RemoteOperation[]
): RemoteOperation[] {
  const deduplicated = new Map<string, RemoteOperation>();
  for (const operation of operations) {
    const key = toPathKey(operation.path);
    if (deduplicated.has(key)) {
      deduplicated.delete(key);
    }
    deduplicated.set(key, operation);
  }
  return Array.from(deduplicated.values()).sort(
    (left, right) => left.path.length - right.path.length
  );
}

export function getYValueAtPath(
  root: Y.Map<unknown>,
  path: PathSegment[]
): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current instanceof Y.Map) {
      current = current.get(String(segment));
      continue;
    }
    if (current instanceof Y.Array) {
      const index =
        typeof segment === 'number' ? segment : Number.parseInt(segment, 10);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current.get(index);
      continue;
    }
    return undefined;
  }
  return current;
}

export function setAtPath(target: any, path: PathSegment[], value: unknown) {
  if (path.length === 0) {
    return;
  }
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const nextSegment = path[index + 1];
    const nextValue = current[segment];
    if (typeof nextValue !== 'object' || nextValue === null) {
      current[segment] = typeof nextSegment === 'number' ? [] : {};
    }
    current = current[segment];
  }
  const leaf = path[path.length - 1];
  current[leaf] = cloneForStore(value);
}

export function deleteAtPath(target: any, path: PathSegment[]) {
  if (path.length === 0) {
    return;
  }
  let current = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    current = current[path[index]];
    if (typeof current !== 'object' || current === null) {
      return;
    }
  }
  const leaf = path[path.length - 1];
  if (Array.isArray(current) && typeof leaf === 'number') {
    if (leaf >= 0 && leaf < current.length) {
      current.splice(leaf, 1);
    }
    return;
  }
  delete current[leaf];
}

export function collectRemoteOperations(
  events: Y.YEvent<Y.AbstractType<unknown>>[],
  stateMap: Y.Map<unknown>
): RemoteOperation[] {
  const operations: RemoteOperation[] = [];
  for (const event of events) {
    if (event instanceof Y.YMapEvent) {
      for (const changedKey of event.keysChanged) {
        const path = [...event.path, changedKey];
        const keyChange = event.changes.keys.get(changedKey);
        if (keyChange?.action === 'delete') {
          operations.push({
            type: 'delete',
            path
          });
          continue;
        }
        operations.push({
          type: 'set',
          path,
          value: toPlainValue(getYValueAtPath(stateMap, path))
        });
      }
      continue;
    }
    if (event instanceof Y.YArrayEvent) {
      const path = [...event.path];
      operations.push({
        type: 'set',
        path,
        value: toPlainValue(getYValueAtPath(stateMap, path))
      });
    }
  }
  return operations;
}
