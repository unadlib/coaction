// @ts-nocheck
import { create } from 'coaction';
import { runBinderCommitConformance } from '../../core/test/binderCommitConformance';
import { adapt, bindXState, createActor, createMachine } from '../src';

runBinderCommitConformance({
  packageName: '@coaction/xstate',
  refusesDirectApply: true,
  createStore: () => {
    const actor = createActor(
      createMachine({ context: { count: 0, label: 'a' }, on: {} })
    );
    actor.start();
    return {
      store: create(() => adapt(bindXState(actor))),
      cleanup: () => actor.stop()
    };
  }
});
