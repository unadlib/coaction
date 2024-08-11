import { create } from 'coaction';

export const useStore = create((set) => ({
  name: 'counter',
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    set(() => (this.count += 1));
  }
}));
