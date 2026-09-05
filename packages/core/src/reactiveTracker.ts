import { setActiveSub } from 'alien-signals';
import * as alienSignalsSystem from 'alien-signals/system';
import type { Link, ReactiveNode } from 'alien-signals/system';
import {
  beginReactiveSubscriberTrack,
  disposeReactiveSubscriber,
  endReactiveSubscriberTrack,
  registerReactiveSubscriber
} from './reactivePath';

const ReactiveFlags = (
  alienSignalsSystem as unknown as {
    ReactiveFlags: {
      Mutable: number;
      Watching: number;
      RecursedCheck: number;
      Dirty: number;
    };
  }
).ReactiveFlags;

type ReactiveTrackerNode = ReactiveNode & {
  fn: () => void;
};

export type ReactiveTracker = {
  getSnapshot: () => number;
  hasDependencies: () => boolean;
  subscribe: (listener: () => void) => () => void;
  track: <T>(fn: () => T) => T;
  dispose: () => void;
};

const unwatch = (node: ReactiveNode) => {
  if (!(node.flags & ReactiveFlags.Mutable)) {
    node.depsTail = undefined;
    node.flags = 0;
    purgeDeps(node);
    const sub = node.subs;
    if (sub !== undefined) {
      unlink(sub);
    }
    return;
  }
  if (node.depsTail !== undefined) {
    node.depsTail = undefined;
    node.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
    purgeDeps(node);
  }
};

const unlink = (link: Link, sub = link.sub) => {
  const dep = link.dep;
  const prevDep = link.prevDep;
  const nextDep = link.nextDep;
  const nextSub = link.nextSub;
  const prevSub = link.prevSub;

  if (nextDep !== undefined) {
    nextDep.prevDep = prevDep;
  } else {
    sub.depsTail = prevDep;
  }
  if (prevDep !== undefined) {
    prevDep.nextDep = nextDep;
  } else {
    sub.deps = nextDep;
  }
  if (nextSub !== undefined) {
    nextSub.prevSub = prevSub;
  } else {
    dep.subsTail = prevSub;
  }
  if (prevSub !== undefined) {
    prevSub.nextSub = nextSub;
  } else if ((dep.subs = nextSub) === undefined) {
    unwatch(dep);
  }
  return nextDep;
};

const purgeDeps = (sub: ReactiveNode) => {
  const depsTail = sub.depsTail;
  let dep = depsTail !== undefined ? depsTail.nextDep : sub.deps;
  while (dep !== undefined) {
    dep = unlink(dep, sub);
  }
};

/**
 * Create a low-level signal dependency tracker for framework adapters.
 *
 * @remarks
 * Adapter and framework authors import this helper from `coaction/adapter`.
 */
export const createReactiveTracker = (): ReactiveTracker => {
  let version = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const node: ReactiveTrackerNode = {
    deps: undefined,
    depsTail: undefined,
    subs: undefined,
    subsTail: undefined,
    flags: ReactiveFlags.Watching,
    fn: () => {
      if (disposed) {
        return;
      }
      version += 1;
      listeners.forEach((listener) => listener());
    }
  };
  registerReactiveSubscriber(node);
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    listeners.clear();
    node.depsTail = undefined;
    purgeDeps(node);
    node.flags = 0;
    disposeReactiveSubscriber(node);
  };
  return {
    getSnapshot: () => version,
    hasDependencies: () => !disposed && node.deps !== undefined,
    subscribe(listener) {
      if (disposed) {
        return () => undefined;
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    track(fn) {
      if (disposed) {
        return fn();
      }
      beginReactiveSubscriberTrack(node);
      node.depsTail = undefined;
      node.flags = ReactiveFlags.Watching | ReactiveFlags.RecursedCheck;
      const prevSub = setActiveSub(node);
      try {
        return fn();
      } finally {
        try {
          // Finalize provisional object-path dependencies while this tracker is
          // still active so surviving terminal paths can establish signal links.
          endReactiveSubscriberTrack(node);
        } finally {
          setActiveSub(prevSub);
          node.flags &= ~ReactiveFlags.RecursedCheck;
          purgeDeps(node);
        }
      }
    },
    dispose
  };
};
