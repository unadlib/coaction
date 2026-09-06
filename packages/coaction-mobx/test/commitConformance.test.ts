import { create } from 'coaction';
import { makeAutoObservable } from 'mobx';
import { runBinderCommitConformance } from '../../core/test/binderCommitConformance';
import { bindMobx } from '../src';

let id = 0;

runBinderCommitConformance({
  packageName: '@coaction/mobx',
  createStore: () => ({
    store: create<{ count: number; label: string }>(
      () => makeAutoObservable(bindMobx({ count: 0, label: 'a' })) as never,
      { name: `mobx-conformance-${id++}` }
    )
  })
});
