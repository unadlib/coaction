import { create } from 'coaction';

export const counterStore = create({
  name: 'counter',
  count: 0,
  get countSquared() {
    return this.count ** 2;
  },
  increment() {
    this.count += 1;
  },
  decrement() {
    this.count;
  }
});
