import { create } from '@coaction/react';
import { createTransport } from 'data-transport';
import { counter, type Counter } from './counter';

export const useStore = create<{
  counter: Counter;
}>(
  {
    counter
  },
  {
    transport: createTransport('SharedWorkerInternal', {})
  }
);
