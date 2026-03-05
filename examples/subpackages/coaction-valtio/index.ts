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

  store.getState().increment();
  const afterCoactionIncrement = source.count;

  source.increment();
  const afterSourceIncrement = store.getState().count;

  store.setState({
    count: 10
  });

  const result = {
    afterCoactionIncrement,
    afterSourceIncrement,
    finalCoactionCount: store.getState().count,
    finalSourceCount: source.count
  };
  store.destroy();

  return result;
};
