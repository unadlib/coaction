import { startBatch, endBatch } from 'alien-signals';

/** Finish commit delivery before accepting a reentrant write. Observer errors
 * reach the outer caller after every queued commit/subscription is delivered.
 * Nested mutation calls still deliver their commits before returning, while
 * middleware suppression flags (history replay and remote sync) remain set.
 */
export const createNotifications = () => {
  let depth = -1;
  const commits: Array<() => void> = [];
  const listeners: Array<() => void> = [];
  let failure: { error: unknown } | undefined;
  const invoke = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      failure ??= { error };
    }
  };
  const drainCommits = () => {
    while (commits.length) invoke(commits.shift()!);
  };
  const run = <R>(fn: () => R): R => {
    if (depth > 0) return fn();
    const outer = depth < 0;
    depth = 0;
    drainCommits();
    depth = 1;
    startBatch();
    let failed = false;
    try {
      return fn();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      depth = 0;
      drainCommits();
      invoke(endBatch);
      if (outer) {
        while (listeners.length) {
          invoke(listeners.shift()!);
          drainCommits();
        }
        depth = -1;
        const first = failure;
        failure = undefined;
        // Preserve a mutation error; surface observer errors only after success.
        // eslint-disable-next-line no-unsafe-finally
        if (!failed && first) throw first.error;
      }
    }
  };
  const notify = (fn: () => void, commit = false) => {
    if (depth >= 0) (commit ? commits : listeners).push(fn);
    else run(() => notify(fn, commit));
  };
  return { run, notify, attempt: invoke };
};
