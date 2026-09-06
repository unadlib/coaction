// @ts-nocheck
import { create } from 'coaction';
import { runBinderCommitConformance } from '../../core/test/binderCommitConformance';
import { adapt, atom, bindJotai, createStore } from '../src';

runBinderCommitConformance({
  packageName: '@coaction/jotai',
  createStore: () => {
    const jotaiStore = createStore();
    const atoms = { count: atom(0), label: atom('a') };
    return {
      store: create(() => adapt(bindJotai({ store: jotaiStore, atoms })))
    };
  }
});
