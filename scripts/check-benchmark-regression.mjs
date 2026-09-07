#!/usr/bin/env node

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import benchmark from 'benchmark';
import { create as createWithZustand } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  create as createWithCoaction,
  effect
} from '../packages/core/dist/index.mjs';
import { onStoreCommit } from '../packages/core/dist/adapter.mjs';

const { Suite } = benchmark;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const thresholds = JSON.parse(
  readFileSync(join(scriptDir, 'benchmark-regression-thresholds.json'), 'utf8')
);
const results = {};

const formatHz = (hz) => Math.round(hz).toLocaleString('en-US');

const record = (target) => {
  results[target.name] = {
    hz: target.hz,
    rme: target.stats.rme,
    samples: target.stats.sample.length
  };
  console.log(
    `${target.name}: ${formatHz(target.hz)} ops/sec ±${target.stats.rme.toFixed(
      2
    )}% (${target.stats.sample.length} samples)`
  );
};

const runSuite = (name, suite) => {
  console.log(`\n${name}`);
  suite
    .on('cycle', (event) => record(event.target))
    .on('complete', function () {
      console.log(`Fastest: ${this.filter('fastest').map('name')}`);
    })
    .run({ async: false });
};

const itemCount = 1000;

let bulkStore;
let untrackedStore;
let trackedStore;

const createTrackingStore = () =>
  createWithCoaction((set) => ({
    items: createItems(),
    get total() {
      return sumItems(this.items);
    },
    bump: (index) => {
      set((state) => {
        state.items[index].quantity += 1;
      });
    }
  }));

const createItems = () =>
  Array.from({ length: itemCount }, (_, index) => ({
    price: (index % 50) + 1,
    quantity: (index % 5) + 1
  }));

const sumItems = (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

const nextIndex = (() => {
  let index = 0;
  return () => {
    index = (index + 1) % itemCount;
    return index;
  };
})();

const createCoactionAccessorStore = () =>
  createWithCoaction((set) => ({
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
  createWithCoaction((set, get) => ({
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

const createCoactionReplacementStore = () =>
  createWithCoaction((set, get) => ({
    items: createItems(),
    get total() {
      return sumItems(this.items);
    },
    bump(index) {
      const items = get().items.slice();
      items[index] = {
        ...items[index],
        quantity: items[index].quantity + 1
      };
      set({ items });
    }
  }));

const createCoactionUnrelatedFieldStore = () =>
  createWithCoaction((set) => ({
    items: createItems(),
    counter: 0,
    bump() {
      set({ counter: Math.random() });
    }
  }));

const createZustandUnrelatedFieldStore = () =>
  createWithZustand((set) => ({
    items: createItems(),
    counter: 0,
    bump() {
      set({ counter: Math.random() });
    }
  }));

const createZustandSelectorStore = () =>
  createWithZustand((set, get) => ({
    items: createItems(),
    bump(index) {
      const items = get().items.slice();
      items[index] = {
        ...items[index],
        quantity: items[index].quantity + 1
      };
      set({ items });
    }
  }));

let coactionAccessor = createCoactionAccessorStore();
let coactionManualDeps = createCoactionManualDepsStore();
let coactionReplacement = createCoactionReplacementStore();
let coactionUnrelated = createCoactionUnrelatedFieldStore();
let zustandUnrelated = createZustandUnrelatedFieldStore();
let zustandSelector = createZustandSelectorStore();

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
      'Coaction object replacement + cached getter',
      () => {
        const index = nextIndex();
        coactionReplacement.getState().bump(index);
        void coactionReplacement.getState().total;
      },
      {
        onStart: () => {
          coactionReplacement = createCoactionReplacementStore();
        }
      }
    )
    .add(
      'Coaction unrelated field replacement',
      () => {
        coactionUnrelated.getState().bump();
      },
      {
        onStart: () => {
          coactionUnrelated = createCoactionUnrelatedFieldStore();
        }
      }
    )
    .add(
      'Zustand unrelated field replacement',
      () => {
        zustandUnrelated.getState().bump();
      },
      {
        onStart: () => {
          zustandUnrelated = createZustandUnrelatedFieldStore();
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
);

const createLargeState = () => {
  const createObject = () =>
    Array(50)
      .fill(1)
      .reduce(
        (object, _, index) => Object.assign(object, { [index]: index }),
        {}
      );

  const arr = Array(50_000)
    .fill('')
    .map(() => createObject());
  const map = {};

  Array(1000)
    .fill(1)
    .forEach((_, index) => {
      map[index] = { index };
    });

  return { arr, map };
};

let largeState;
let largeStore;
let value;

runSuite(
  'Large object update throughput',
  new Suite()
    .add(
      'Coaction with Mutative',
      () => {
        largeStore.getState().update();
      },
      {
        onStart: () => {
          value = Math.random();
          largeState = createLargeState();
          largeStore = createWithCoaction((set) => ({
            arr: largeState.arr,
            map: largeState.map,
            update: () => {
              set((state) => {
                state.arr.push(value);
                state.map[value] = { value };
              });
            }
          }));
        }
      }
    )
    .add(
      'Zustand',
      () => {
        largeStore.getState().update();
      },
      {
        onStart: () => {
          value = Math.random();
          largeState = createLargeState();
          largeStore = createWithZustand((set, get) => ({
            arr: largeState.arr,
            map: largeState.map,
            update: () =>
              set({
                arr: [...get().arr, value],
                map: { ...get().map, [value]: { value } }
              })
          }));
        }
      }
    )
    .add(
      'Zustand with Immer',
      () => {
        largeStore.getState().update();
      },
      {
        onStart: () => {
          value = Math.random();
          largeState = createLargeState();
          largeStore = createWithZustand(
            immer((set) => ({
              arr: largeState.arr,
              map: largeState.map,
              update: () => {
                set((state) => {
                  state.arr.push(value);
                  state.map[value] = { value };
                });
              }
            }))
          );
        }
      }
    )
);

/**
 * Measure writes independently of recomputation. A plain subscriber needs no
 * patches; commits, path effects and a previously-read getter do. Their costs
 * differ, so a single "tracked" number cannot cover these paths.
 */
runSuite(
  'Write cost with and without tracking',
  new Suite()
    .add(
      'Coaction write, nothing watching',
      () => {
        untrackedStore.getState().bump(nextIndex());
      },
      {
        onStart: () => {
          untrackedStore = createTrackingStore();
        }
      }
    )
    .add(
      'Coaction write, a getter has been read',
      () => {
        trackedStore.getState().bump(nextIndex());
      },
      {
        onStart: () => {
          trackedStore = createTrackingStore();
          void trackedStore.getState().total;
        }
      }
    )
);

let observedStore;
let disposeObservation;
const observedWrites = new Suite();
for (const [name, observe] of [
  ['a plain subscriber', (store) => store.subscribe(() => {})],
  ['a commit listener', (store) => onStoreCommit(store, () => {})],
  ['a path effect', (store) => effect(() => store.getState().items[0].quantity)]
]) {
  observedWrites.add(
    `Coaction write, ${name}`,
    () => {
      observedStore.getState().bump(nextIndex());
    },
    {
      onStart: () => {
        observedStore = createTrackingStore();
        disposeObservation = observe(observedStore);
      },
      onComplete: () => {
        disposeObservation();
        observedStore.destroy();
      }
    }
  );
}
runSuite('Write cost by observation kind', observedWrites);

// Build the same replacement from raw immutable state for both forms. This
// isolates normalization from the public readonly facade and getter tracking.
let replacementStore;
const replacementWrites = new Suite();
for (const kind of ['object', 'recipe']) {
  replacementWrites.add(
    `Coaction ${kind} replacement, nothing watching`,
    () => {
      const index = nextIndex();
      const items = replacementStore.getPureState().items.slice();
      items[index] = { ...items[index], quantity: items[index].quantity + 1 };
      if (kind === 'object') replacementStore.setState({ items });
      else
        replacementStore.setState((draft) => {
          draft.items = items;
        });
    },
    {
      onStart: () => {
        replacementStore = createTrackingStore();
      },
      onComplete: () => {
        replacementStore.destroy();
      }
    }
  );
}
runSuite('Replacement write cost by input form', replacementWrites);

/** Reversing 10k scalars exercises bulk patch validation and commit work. */
runSuite(
  'Bulk patch commit throughput',
  new Suite().add(
    'Coaction reverse 10k array with a commit listener',
    () => {
      bulkStore.getState().shuffle();
    },
    {
      onStart: () => {
        bulkStore = createWithCoaction(
          (set) => ({
            rows: Array.from({ length: 10000 }, (_, index) => index),
            shuffle: () => {
              set((state) => {
                state.rows.reverse();
              });
            }
          }),
          { enablePatches: true }
        );
        // Patches are only produced when something is listening, and the
        // scan only runs on the pair that produces.
        onStoreCommit(bulkStore, () => undefined);
      }
    }
  )
);

const failures = [];

for (const [name, minHz] of Object.entries(thresholds.minHz)) {
  const result = results[name];

  if (!result) {
    failures.push(`Missing benchmark result for "${name}"`);
    continue;
  }

  if (result.hz < minHz) {
    failures.push(
      `${name} fell below ${formatHz(minHz)} ops/sec: ${formatHz(result.hz)}`
    );
  }
}

for (const { left, right, minRatio } of thresholds.minRatios) {
  const leftResult = results[left];
  const rightResult = results[right];

  if (!leftResult || !rightResult) {
    failures.push(`Missing benchmark ratio inputs for "${left}" / "${right}"`);
    continue;
  }

  const ratio = leftResult.hz / rightResult.hz;

  if (ratio < minRatio) {
    failures.push(
      `${left} / ${right} ratio ${ratio.toFixed(2)} fell below ${minRatio}`
    );
  }
}

const reportRows = Object.entries(results).map(([name, result]) => ({
  name,
  hz: Math.round(result.hz),
  rme: Number(result.rme.toFixed(2)),
  samples: result.samples
}));

const report = [
  '# Benchmark Regression Report',
  '',
  '| Benchmark | ops/sec | RME | Samples |',
  '| :-- | --: | --: | --: |',
  ...reportRows.map(
    ({ name, hz, rme, samples }) =>
      `| ${name} | ${hz.toLocaleString('en-US')} | ${rme}% | ${samples} |`
  ),
  '',
  failures.length === 0
    ? 'Benchmark regression thresholds passed.'
    : `Benchmark regression thresholds failed:\n\n${failures
        .map((failure) => `- ${failure}`)
        .join('\n')}`,
  ''
].join('\n');

writeFileSync(
  'benchmark-results.json',
  `${JSON.stringify(reportRows, null, 2)}\n`
);
writeFileSync('benchmark-report.md', report);

if (failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log('\nBenchmark regression thresholds passed.');
