import { create } from '@coaction/react';
import { logger } from '@coaction/logger';
import { create as createWithZustand } from 'zustand';
import { bindZustand, adapt } from '@coaction/zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import localforage from 'localforage';

import { counter, type Counter } from './counter';

export const useStore = create<Counter>(
  () =>
    adapt(
      createWithZustand(
        persist(bindZustand(counter), {
          name: 'counter',
          storage: createJSONStorage(() => localforage)
        })
      )
    ),
  {
    middlewares: [
      logger({
        collapsed: false
      })
    ]
  }
);

globalThis.useStore = useStore;
