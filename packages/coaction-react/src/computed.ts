class Computed<T> {
  private deps: () => any[];
  private getter: () => T;

  constructor(deps: () => any[], getter: () => T) {
    this.deps = deps;
    this.getter = getter;
  }

  get() {
    return this.getter();
  }
}

export const computed = <T>(deps: () => any[], getter: () => T) => {
  return new Computed(deps, getter);
};
