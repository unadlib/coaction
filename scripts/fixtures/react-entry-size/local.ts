import { create } from '../../../packages/coaction-react/local';

export const createCounter = () =>
  create((set) => ({
    count: 0,
    increment() {
      set(() => {
        this.count += 1;
      });
    }
  }));
