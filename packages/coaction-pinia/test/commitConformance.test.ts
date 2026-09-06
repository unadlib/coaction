// @ts-nocheck
import { create } from 'coaction';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { runBinderCommitConformance } from '../../core/test/binderCommitConformance';
import { adapt, bindPinia } from '../src';

let id = 0;

runBinderCommitConformance({
  packageName: '@coaction/pinia',
  createStore: () => {
    setActivePinia(createPinia());
    const name = `pinia-conformance-${id++}`;
    return {
      store: create(
        () =>
          adapt(
            defineStore(
              name,
              bindPinia({ state: () => ({ count: 0, label: 'a' }) })
            )
          ),
        { name }
      )
    };
  }
});
