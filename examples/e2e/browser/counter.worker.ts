import { create } from '../../../packages/core/src/index';
import { workerCounter, type WorkerCounterState } from './workerCounter';

const workerUrl = new URL(globalThis.location.href);
const storeName = workerUrl.searchParams.get('name') ?? 'browser-worker-e2e';

create<WorkerCounterState>(workerCounter, {
  name: storeName
});
