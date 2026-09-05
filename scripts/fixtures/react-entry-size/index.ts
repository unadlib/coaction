import { create } from '../../../packages/coaction-react';

export const createCounter = () =>
  create((set) => ({
    count: 0,
    increment() {
      set(() => {
        this.count += 1;
      });
    }
  }));
