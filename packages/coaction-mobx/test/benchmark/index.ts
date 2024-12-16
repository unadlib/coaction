import fs from 'fs';
import https from 'https';
import { Suite } from 'benchmark';
import QuickChart from 'quickchart-js';
import { createCoactionMobxStore } from './coaction-mobx';
import { createMobxStore } from './mobx';
import { createCoactionStore } from './coaction';
import { createMobxKeystoneStore } from './mobx-keystone';

const labels: string[] = [];
const result: any[] = [
  {
    label: '@coaction/mobx',
    backgroundColor: 'rgba(54, 162, 235, 0.5)',
    data: []
  },
  {
    label: 'coaction',
    backgroundColor: 'rgba(0, 255, 0, 0.5)',
    data: []
  },
  {
    label: 'mobx-keystone',
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
    data: []
  },
  {
    label: 'mobx',
    backgroundColor: 'rgba(221, 0, 255, 0.5)',
    data: []
  }
];

const suite = new Suite();

let store: any;

suite
  .add(
    '@coaction/mobx - bigInitWithoutRefsWithoutAssign',
    () => {
      store.bigInitWithoutRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createCoactionMobxStore();
      }
    }
  )
  .add(
    'mobx - bigInitWithoutRefsWithoutAssign',
    () => {
      store.bigInitWithoutRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createMobxStore();
      }
    }
  )
  .add(
    'coaction - bigInitWithoutRefsWithoutAssign',
    () => {
      store.bigInitWithoutRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createCoactionStore();
      }
    }
  )
  .add(
    'mobx-keystone - bigInitWithoutRefsWithoutAssign',
    () => {
      store.bigInitWithoutRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createMobxKeystoneStore();
      }
    }
  )
  .add(
    '@coaction/mobx - bigInitWithoutRefsWithAssign',
    () => {
      store.bigInitWithoutRefsWithAssign();
    },
    {
      onStart: () => {
        store = createCoactionMobxStore();
      }
    }
  )
  .add(
    'mobx - bigInitWithoutRefsWithAssign',
    () => {
      store.bigInitWithoutRefsWithAssign();
    },
    {
      onStart: () => {
        store = createMobxStore();
      }
    }
  )
  .add(
    'coaction - bigInitWithoutRefsWithAssign',
    () => {
      store.bigInitWithoutRefsWithAssign();
    },
    {
      onStart: () => {
        store = createCoactionStore();
      }
    }
  )
  .add(
    'mobx-keystone - bigInitWithoutRefsWithAssign',
    () => {
      store.bigInitWithoutRefsWithAssign();
    },
    {
      onStart: () => {
        store = createMobxKeystoneStore();
      }
    }
  )
  .add(
    '@coaction/mobx - bigInitWithRefsWithoutAssign',
    () => {
      store.bigInitWithRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createCoactionMobxStore();
      }
    }
  )
  .add(
    'mobx - bigInitWithRefsWithoutAssign',
    () => {
      store.bigInitWithRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createMobxStore();
      }
    }
  )
  .add(
    'coaction - bigInitWithRefsWithoutAssign',
    () => {
      store.bigInitWithRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createCoactionStore();
      }
    }
  )
  .add(
    'mobx-keystone - bigInitWithRefsWithoutAssign',
    () => {
      store.bigInitWithRefsWithoutAssign();
    },
    {
      onStart: () => {
        store = createMobxKeystoneStore();
      }
    }
  )
  .add(
    '@coaction/mobx - bigInitWithRefsWithAssign',
    () => {
      store.bigInitWithRefsWithAssign();
    },
    {
      onStart: () => {
        store = createCoactionMobxStore();
      }
    }
  )
  .add(
    'mobx - bigInitWithRefsWithAssign',
    () => {
      store.bigInitWithRefsWithAssign();
    },
    {
      onStart: () => {
        store = createMobxStore();
      }
    }
  )
  .add(
    'coaction - bigInitWithRefsWithAssign',
    () => {
      store.bigInitWithRefsWithAssign();
    },
    {
      onStart: () => {
        store = createCoactionStore();
      }
    }
  )
  .add(
    'mobx-keystone - bigInitWithRefsWithAssign',
    () => {
      store.bigInitWithRefsWithAssign();
    },
    {
      onStart: () => {
        store = createMobxKeystoneStore();
      }
    }
  )
  .add(
    '@coaction/mobx - init',
    () => {
      store.init();
    },
    {
      onStart: () => {
        store = createCoactionMobxStore();
      }
    }
  )
  .add(
    'mobx - init',
    () => {
      store.init();
    },
    {
      onStart: () => {
        store = createMobxStore();
      }
    }
  )
  .add(
    'coaction - init',
    () => {
      store.init();
    },
    {
      onStart: () => {
        store = createCoactionStore();
      }
    }
  )
  .add(
    'mobx-keystone - init',
    () => {
      store.init();
    },
    {
      onStart: () => {
        store = createMobxKeystoneStore();
      }
    }
  )
  .on('cycle', (event: any) => {
    console.log(String(event.target));
    const [name, field] = event.target.name.split(' - ');
    if (!labels.includes(field)) labels.push(field);
    const item = result.find(({ label }) => label === name);
    item.data[labels.indexOf(field)] = Math.round(event.target.hz);
  })
  .on('complete', function () {
    // @ts-ignore
    console.log('The fastest method is ' + this.filter('fastest').map('name'));
  })
  .run({ async: false });

try {
  const config = {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: result
    },
    options: {
      title: {
        display: true,
        text: 'Array Performance'
      },
      legend: {
        position: 'bottom'
      },
      elements: {
        rectangle: {
          borderWidth: 1
        }
      },
      scales: {
        xAxes: [
          {
            display: true,
            scaleLabel: {
              display: true,
              fontSize: 10,
              labelString:
                'Measure(ops/sec) to update 10K arrays, bigger is better.'
            }
          }
        ]
      },
      plugins: {
        datalabels: {
          anchor: 'center',
          align: 'center',
          font: {
            size: 8
          }
        }
      }
    }
  };
  const chart = new QuickChart();
  chart.setConfig(config);
  console.log('config:', JSON.stringify(config));
  const file = fs.createWriteStream('benchmark.jpg');
  https.get(chart.getUrl(), (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('update benchmark');
    });
  });
} catch (err) {
  console.error(err);
}
