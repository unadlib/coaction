import { create } from 'coaction';
import { logger } from '@coaction/logger';
import { type Counter, counter } from './store';

const store = create<{
  counter: Counter;
}>(
  {
    counter
  },
  {
    middlewares: [logger({ collapsed: false })]
  }
);
