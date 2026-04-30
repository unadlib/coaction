import { Suite } from 'benchmark';
import { create as createWithCoaction } from 'coaction';
import { create as createWithZustand } from 'zustand';

type Item = {
  price: number;
  quantity: number;
};

type CartData = {
  items: Item[];
};

type CartStore = CartData & {
  readonly total: number;
  bump: (index: number) => void;
};

const itemCount = 1000;

const createItems = () =>
  Array.from({ length: itemCount }, (_, index) => ({
    price: (index % 50) + 1,
    quantity: (index % 5) + 1
  }));

const sumItems = (items: Item[]) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

const nextIndex = (() => {
  let index = 0;
  return () => {
    index = (index + 1) % itemCount;
    return index;
  };
})();

const createCoactionAccessorStore = () =>
  createWithCoaction<CartStore>((set) => ({
    items: createItems(),
    get total() {
      return sumItems(this.items);
    },
    bump(index) {
      set((draft) => {
        draft.items[index].quantity += 1;
      });
    }
  }));

const createCoactionManualDepsStore = () =>
  createWithCoaction<CartStore>((set, get) => ({
    items: createItems(),
    total: get(
      (state) => [state.items],
      (items) => sumItems(items)
    ),
    bump(index) {
      set((draft) => {
        draft.items[index].quantity += 1;
      });
    }
  }));

const createZustandSelectorStore = () =>
  createWithZustand<CartData & { bump: (index: number) => void }>(
    (set, get) => ({
      items: createItems(),
      bump(index) {
        const items = get().items.slice();
        items[index] = {
          ...items[index],
          quantity: items[index].quantity + 1
        };
        set({ items });
      }
    })
  );

const createZustandMaintainedTotalStore = () => {
  const items = createItems();
  return createWithZustand<CartStore>((set, get) => ({
    items,
    total: sumItems(items),
    bump(index) {
      const current = get();
      const previous = current.items[index];
      const next = {
        ...previous,
        quantity: previous.quantity + 1
      };
      const items = current.items.slice();
      items[index] = next;
      set({
        items,
        total: current.total + next.price
      });
    }
  }));
};

const runSuite = (name: string, suite: Suite) => {
  console.log(`\n${name}`);
  suite
    .on('cycle', (event: { target: unknown }) => {
      console.log(String(event.target));
    })
    .on('complete', function (this: Suite) {
      console.log(`Fastest: ${this.filter('fastest').map('name')}`);
    })
    .run({ async: false });
};

let coactionAccessor = createCoactionAccessorStore();
let coactionManualDeps = createCoactionManualDepsStore();
let zustandSelector = createZustandSelectorStore();
let zustandMaintainedTotal = createZustandMaintainedTotalStore();

runSuite(
  'Stable derived reads',
  new Suite()
    .add('Coaction cached accessor getter', () => {
      void coactionAccessor.getState().total;
    })
    .add('Coaction computed with manual deps', () => {
      void coactionManualDeps.getState().total;
    })
    .add('Zustand selector recompute', () => {
      void sumItems(zustandSelector.getState().items);
    })
    .add('Zustand maintained total field', () => {
      void zustandMaintainedTotal.getState().total;
    })
);

runSuite(
  'Update then read derived value',
  new Suite()
    .add(
      'Coaction mutable update + cached getter',
      () => {
        const index = nextIndex();
        coactionAccessor.getState().bump(index);
        void coactionAccessor.getState().total;
      },
      {
        onStart: () => {
          coactionAccessor = createCoactionAccessorStore();
        }
      }
    )
    .add(
      'Coaction mutable update + manual deps',
      () => {
        const index = nextIndex();
        coactionManualDeps.getState().bump(index);
        void coactionManualDeps.getState().total;
      },
      {
        onStart: () => {
          coactionManualDeps = createCoactionManualDepsStore();
        }
      }
    )
    .add(
      'Zustand immutable update + selector recompute',
      () => {
        const index = nextIndex();
        zustandSelector.getState().bump(index);
        void sumItems(zustandSelector.getState().items);
      },
      {
        onStart: () => {
          zustandSelector = createZustandSelectorStore();
        }
      }
    )
    .add(
      'Zustand immutable update + maintained total',
      () => {
        const index = nextIndex();
        zustandMaintainedTotal.getState().bump(index);
        void zustandMaintainedTotal.getState().total;
      },
      {
        onStart: () => {
          zustandMaintainedTotal = createZustandMaintainedTotalStore();
        }
      }
    )
);
