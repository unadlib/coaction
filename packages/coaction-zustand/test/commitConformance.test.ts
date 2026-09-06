import { create } from 'coaction';
import { create as createWithZustand } from 'zustand';
import { runBinderCommitConformance } from '../../core/test/binderCommitConformance';
import { bindZustand } from '../src';

runBinderCommitConformance({
  packageName: '@coaction/zustand',
  createStore: () => ({
    store: create<{ count: number; label: string }>(
      () =>
        createWithZustand(
          bindZustand(() => ({ count: 0, label: 'a' }))
        ) as never
    )
  })
});
