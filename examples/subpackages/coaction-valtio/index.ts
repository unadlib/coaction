import { create } from 'coaction';
import { adapt, bindValtio, proxy } from '@coaction/valtio';

export const runExample = () => {
  const source = proxy(
    bindValtio({
      count: 0,
      increment() {
        this.count += 1;
      }
    })
  );

  const store = create(() => adapt(source), {
    name: 'valtio-example'
  });

  source.increment();
  const result = {
    count: store.getState().count
  };
  store.destroy();

  return result;
};
