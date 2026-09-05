/** Path helpers shared by the sync core and the adapters built on it. */

/** Normalize a patch path, which may be an array or an RFC 6901 pointer. */
export const normalizePatchPath = (path: unknown): PropertyKey[] => {
  if (Array.isArray(path)) {
    return path.map((segment) =>
      typeof segment === 'number' ? String(segment) : (segment as PropertyKey)
    );
  }
  if (typeof path !== 'string' || path === '') return [];
  return path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
};

/**
 * The segment directly under `prefix` that `path` addresses, or undefined when
 * `path` does not reach into `prefix` at all.
 *
 * `['todos', 'a', 'done']` under `['todos']` is `'a'`; the collection itself,
 * `['todos']`, is undefined because no single record is addressed.
 */
export const childKeyUnder = (
  path: readonly PropertyKey[],
  prefix: readonly PropertyKey[]
): string | undefined => {
  if (path.length <= prefix.length) return undefined;
  for (let index = 0; index < prefix.length; index += 1) {
    if (!Object.is(path[index], prefix[index])) return undefined;
  }
  return String(path[prefix.length]);
};

/** Read the value at `path`, or undefined if any step is missing. */
export const readAtPath = (root: unknown, path: readonly PropertyKey[]) => {
  let current = root as Record<PropertyKey, unknown> | undefined;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[segment] as Record<PropertyKey, unknown> | undefined;
  }
  return current;
};

/**
 * Whether `path` addresses `prefix` itself, or something that contains it.
 *
 * `['todos']` and `[]` both reach the collection at `['todos']`; a write there
 * changes records without naming any of them.
 */
export const reachesPath = (
  path: readonly PropertyKey[],
  prefix: readonly PropertyKey[]
): boolean => {
  if (path.length > prefix.length) return false;
  for (let index = 0; index < path.length; index += 1) {
    if (!Object.is(path[index], prefix[index])) return false;
  }
  return true;
};
