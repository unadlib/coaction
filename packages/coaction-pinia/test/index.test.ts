import { defineStore, createPinia, setActivePinia } from 'pinia';
import { createTransport, mockPorts } from 'data-transport';
import { createWithPinia as create } from '../src';

test('', () => {
  const useCounterStore = defineStore('counter', {
    state: () => ({ count: 0, name: 'Eduardo' }),
    getters: {
      doubleCount: (state) => state.count * 2
    },
    actions: {
      increment() {
        this.count++;
      }
    }
  });

  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCounterStore();
  expect(store.count).toBe(0);
  store.increment();
  store.$state.count = 10;
  expect(store.count).toBe(10);
});
