import { createBinder, type Store } from 'coaction';

export * from 'xstate';

type XStateActor<TContext extends object = object, TEvent = any> = {
  getSnapshot: () => {
    context: TContext;
  };
  subscribe: (observer: (snapshot: { context: TContext }) => void) => {
    unsubscribe: () => void;
  };
  send: (event: TEvent) => void;
};

const actorMap = new WeakMap<object, XStateActor<any, any>>();

/**
 * Bind an XState actor to Coaction.
 */
export const bindXState = createBinder<
  <TContext extends object, TEvent>(
    actor: XStateActor<TContext, TEvent>
  ) => {
    [K in keyof TContext]: TContext[K];
  } & {
    send: (event: TEvent) => void;
  }
>({
  handleStore: (store, rawState) => {
    const actor = actorMap.get(rawState);
    if (!actor) {
      throw new Error('xstate actor is not found');
    }
    let isFromActor = false;
    const baseSetState = store.setState;
    store.setState = (next, updater) => {
      if (!isFromActor) {
        throw new Error(
          'setState is not supported with xstate binding. Please use actor events.'
        );
      }
      return baseSetState(next, updater);
    };
    const subscription = actor.subscribe((snapshot) => {
      isFromActor = true;
      try {
        baseSetState(snapshot.context as any);
      } finally {
        isFromActor = false;
      }
    });
    const baseDestroy = store.destroy;
    store.destroy = () => {
      subscription.unsubscribe();
      baseDestroy();
    };
  },
  handleState: ((actor: XStateActor<any, any>) => {
    const snapshot = actor.getSnapshot();
    const state = Object.assign({}, snapshot.context, {
      send: actor.send.bind(actor)
    });
    const descriptors = Object.getOwnPropertyDescriptors(state);
    const copyState = Object.defineProperties({}, descriptors);
    const rawState = Object.defineProperties({}, descriptors);
    actorMap.set(rawState, actor);
    return {
      copyState,
      bind: () => rawState
    };
  }) as any
}) as <TContext extends object, TEvent>(
  actor: XStateActor<TContext, TEvent>
) => {
  [K in keyof TContext]: TContext[K];
} & {
  send: (event: TEvent) => void;
};

/**
 * Adapt a state type for Coaction create function.
 */
export const adapt = <T extends object>(store: T) => store as T;
