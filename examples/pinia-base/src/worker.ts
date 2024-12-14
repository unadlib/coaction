import { create } from 'coaction';
import { logger } from '@coaction/logger';
import { counter, type Counter } from './counter';

create<Counter>(counter, {
  middlewares: [
    logger({
      collapsed: false
    })
  ]
});
