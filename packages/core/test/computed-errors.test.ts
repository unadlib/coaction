import { create, effect } from '../src';

test.each(['getter', 'manual'] as const)(
  '%s caches failures, links dependents, and recovers when inputs change',
  (kind) => {
    const errors = [undefined, new Error('invalid'), 'invalid'];
    let calls = 0;
    const evaluate = (n: number) => {
      calls++;
      if (n < 3) throw errors[n];
      return n % 2;
    };
    const store = create((_, get) => ({
      n: 0,
      get getter() {
        return evaluate(this.n);
      },
      manual: get((state) => [state.n], evaluate)
    }));
    const read = () => store.getState()[kind];
    const outcomes: unknown[] = [];
    const stop = effect(() => {
      try {
        outcomes.push({ value: read() });
      } catch (error) {
        outcomes.push({ error });
      }
    });
    const assertFailure = (error: unknown) => {
      for (let i = 0; i < 2; i++) {
        let caught = false;
        try {
          read();
        } catch (value) {
          caught = true;
          expect(value).toBe(error);
        }
        expect(caught).toBe(true);
      }
    };
    assertFailure(undefined);
    expect(calls).toBe(1);
    store.setState({ n: 1 });
    assertFailure(errors[1]);
    store.setState({ n: 3 });
    expect(read()).toBe(1);
    expect(read()).toBe(1);
    store.setState({ n: 5 });
    expect(outcomes).toEqual([
      { error: undefined },
      { error: errors[1] },
      { value: 1 }
    ]);
    store.setState({ n: 2 });
    assertFailure('invalid');
    store.setState({ n: 4 });
    expect(outcomes.slice(-2)).toEqual([{ error: 'invalid' }, { value: 0 }]);
    expect(calls).toBe(6);
    stop();
    store.destroy();
  }
);

test('a failed getter in an aborted recipe does not poison its committed cache', () => {
  const store = create(() => ({
    n: 1,
    get selected() {
      if (!this.n) throw new Error('zero');
      return this.n;
    }
  }));
  expect(store.getState().selected).toBe(1);
  expect(() =>
    store.setState((state) => {
      state.n = 0;
      void store.getState().selected;
    })
  ).toThrow('zero');
  expect(store.getPureState().n).toBe(1);
  expect(store.getState().selected).toBe(1);
  store.destroy();
});
