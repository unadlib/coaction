import {
  createBinder,
  onStoreReady,
  replaceExternalStoreState
} from 'coaction/adapter';

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

const isUnsafeKey = (key: PropertyKey) =>
  typeof key === 'string' &&
  (key === '__proto__' || key === 'prototype' || key === 'constructor');

const getOwnEnumerableKeys = (value: object) =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key)
  );

const assignContext = (
  target: Record<PropertyKey, unknown>,
  source: Record<PropertyKey, unknown>
) => {
  for (const key of getOwnEnumerableKeys(source)) {
    if (isUnsafeKey(key)) {
      continue;
    }
    target[key] = source[key];
  }
};

const unsupportedMutationMessage =
  'XState binding state cannot be mutated directly. Please use actor events.';

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
  handleStore: (store, rawState, _state, internal) => {
    const actor = actorMap.get(rawState);
    if (!actor) {
      throw new Error('xstate actor is not found');
    }
    store.setState = () => {
      throw new Error(unsupportedMutationMessage);
    };
    if (store.share === 'client') {
      return;
    }
    let isApplyingActorSnapshot = false;
    internal.assertMutationAllowed = (operation) => {
      if (operation === 'apply' && isApplyingActorSnapshot) {
        return;
      }
      throw new Error(unsupportedMutationMessage);
    };
    // No writer of its own. An actor's context is replaced wholesale through
    // `replaceExternalStoreState` below, so the ordinary `store.apply` does the
    // work; all this binding adds is the refusal above, which
    // `assertMutationAllowed` already carries.
    const applyActorSnapshot = (context: Record<PropertyKey, unknown>) => {
      isApplyingActorSnapshot = true;
      try {
        replaceExternalStoreState(store, internal, context);
      } finally {
        isApplyingActorSnapshot = false;
      }
    };
    let subscription: { unsubscribe: () => void } | undefined;
    const cancelReadySubscription = onStoreReady(store, () => {
      subscription = actor.subscribe((snapshot) => {
        applyActorSnapshot(snapshot.context as Record<PropertyKey, unknown>);
      });
    });
    const baseDestroy = store.destroy;
    let destroyed = false;
    store.destroy = () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      cancelReadySubscription();
      subscription?.unsubscribe();
      subscription = undefined;
      baseDestroy();
    };
  },
  handleState: ((actor: XStateActor<any, any>) => {
    const snapshot = actor.getSnapshot();
    const state: Record<PropertyKey, unknown> = {};
    assignContext(state, snapshot.context as Record<PropertyKey, unknown>);
    state.send = actor.send.bind(actor);
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
