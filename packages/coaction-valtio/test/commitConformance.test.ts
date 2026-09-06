import { create } from 'coaction';
import { runBinderCommitConformance } from '../../core/test/binderCommitConformance';
import { bindValtio, proxy } from '../src';

let id = 0;

runBinderCommitConformance({
  packageName: '@coaction/valtio',
  createStore: () => ({
    store: create<{ count: number; label: string }>(
      () => proxy(bindValtio({ count: 0, label: 'a' })) as never,
      { name: `valtio-conformance-${id++}` }
    )
  })
});
