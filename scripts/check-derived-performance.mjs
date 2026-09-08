#!/usr/bin/env node
/** Built production entries, one fresh process per workload; no framework/transport/history. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.argv[2] === '--case') {
  const { mode, size, workload } = JSON.parse(process.argv[3]);
  const { create } = await import('../packages/core/dist/index.mjs');
  const { derive, derivePath } =
    await import('../packages/core/dist/derived.mjs');
  let evaluations = 0;
  const created = performance.now();
  const store = create((set) => ({
    rows: Array.from({ length: size }, () => ({ n: 1 })),
    get first() {
      evaluations++;
      return this.rows[0].n;
    },
    get total() {
      evaluations++;
      return this.rows.reduce((sum, row) => sum + row.n, 0);
    },
    bump(index) {
      set((s) => {
        s.rows[index].n++;
      });
    }
  }));
  const createMs = performance.now() - created;
  const scan = workload === 'scan';
  let read;
  if (mode === 'native')
    read = () => (scan ? store.getState().total : store.getState().first);
  else if (mode === 'coarse') read = derive(store, (s) => s.total);
  else if (mode === 'path') read = derivePath(store, ['rows', 0, 'n']);
  else if (mode !== 'none')
    read = derive(
      store,
      (s) => {
        evaluations++;
        return scan ? s.rows.reduce((sum, row) => sum + row.n, 0) : s.rows[0].n;
      },
      { deep: true }
    );
  const firstRead = performance.now();
  if (read && mode !== 'lazy') read();
  const coldReadMs = performance.now() - firstRead;
  if (mode === 'disposed') read.dispose();
  let writes = 0;
  let sink;
  const index = workload === 'related' ? 0 : size - 1;
  const once =
    workload === 'cached'
      ? () => {
          sink = read();
        }
      : () => {
          store.getState().bump(index);
          writes++;
          if (workload !== 'write') sink = read();
        };
  const sample = (ms) => {
    const started = performance.now();
    let count = 0;
    const batch = scan ? 1 : workload === 'cached' ? 1000 : 64;
    do {
      for (let i = 0; i < batch; i++) once();
      count += batch;
    } while (performance.now() - started < ms);
    return count / ((performance.now() - started) / 1000);
  };
  sample(200);
  const samples = Array.from({ length: 5 }, () => sample(200)).sort(
    (a, b) => a - b
  );
  if (workload !== 'write')
    assert.equal(sink, scan ? size + writes : index === 0 ? 1 + writes : 1);
  assert.equal(store.getPureState().rows[index].n, 1 + writes);
  if (mode === 'deep' && workload === 'unrelated') assert.equal(evaluations, 1);
  read?.dispose?.();
  store.destroy();
  console.log(
    JSON.stringify({
      mode,
      size,
      workload,
      hz: samples[2],
      minHz: samples[0],
      maxHz: samples[4],
      createMs,
      coldReadMs,
      evaluations
    })
  );
} else {
  const cases = ['none', 'lazy', 'disposed'].map((mode) => ({
    mode,
    size: 1000,
    workload: 'write'
  }));
  for (const size of [1000, 10000, 50000]) {
    for (const mode of ['native', 'deep', 'path'])
      cases.push({ mode, size, workload: 'unrelated' });
  }
  for (const mode of ['deep', 'path'])
    cases.push({ mode, size: 10000, workload: 'related' });
  for (const mode of ['native', 'deep', 'coarse'])
    cases.push({ mode, size: 10000, workload: 'scan' });
  cases.push({ mode: 'deep', size: 1000, workload: 'cached' });
  const results = [];
  for (const input of cases) {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [fileURLToPath(import.meta.url), '--case', JSON.stringify(input)],
        {
          env: { ...process.env, NODE_ENV: 'production' },
          encoding: 'utf8'
        }
      )
    );
    results.push(result);
    console.log(
      `${result.size} / ${result.mode} / ${result.workload}: ${Math.round(result.hz).toLocaleString()} ops/sec (${(1e6 / result.hz).toFixed(2)} us/op)`
    );
  }
  const find = (mode, size, workload) =>
    results.find(
      (r) => r.mode === mode && r.size === size && r.workload === workload
    ).hz;
  const failures = [];
  const atLeast = (label, actual, floor) => {
    if (actual < floor)
      failures.push(`${label}: ${actual.toFixed(2)} < ${floor}`);
  };
  for (const mode of ['lazy', 'disposed'])
    atLeast(
      `${mode} / unused write ratio`,
      find(mode, 1000, 'write') / find('none', 1000, 'write'),
      0.75
    );
  atLeast(
    'deep sparse / native sparse ratio at 10k',
    find('deep', 10000, 'unrelated') / find('native', 10000, 'unrelated'),
    1.25
  );
  atLeast(
    'explicit path / deep sparse ratio at 10k',
    find('path', 10000, 'unrelated') / find('deep', 10000, 'unrelated'),
    0.75
  );
  atLeast(
    'coarse derived / native scan ratio at 10k',
    find('coarse', 10000, 'scan') / find('native', 10000, 'scan'),
    0.5
  );
  atLeast('deep sparse writes at 10k', find('deep', 10000, 'unrelated'), 50000);
  atLeast('deep related writes at 10k', find('deep', 10000, 'related'), 25000);
  atLeast('deep stable reads', find('deep', 1000, 'cached'), 1000000);
  writeFileSync(
    'derived-benchmark-results.json',
    JSON.stringify(
      { node: process.version, cpu: cpus()[0]?.model, results, failures },
      null,
      2
    ) + '\n'
  );
  assert.deepEqual(failures, [], 'Derived performance gates failed');
  console.log(
    'Derived performance gates passed. Full deep scans are diagnostic; use native getters for that workload.'
  );
}
