import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { transformSync } from '@babel/core';
import presetEnv from '@babel/preset-env';
import presetReact from '@babel/preset-react';
import reactCompiler from 'babel-plugin-react-compiler';

const rootDir = resolve(import.meta.dirname, '..');
const reactPackageDir = join(rootDir, 'packages/coaction-react');
const localDist = join(reactPackageDir, 'dist/local.js');
if (!existsSync(localDist)) {
  throw new Error(
    'React Compiler integration check requires a built @coaction/react package. Run pnpm build first.'
  );
}

const packageRequire = createRequire(join(reactPackageDir, 'package.json'));
const React = packageRequire('react');
const { JSDOM } = packageRequire('jsdom');
const { act } = React;

const dom = new JSDOM(
  '<!doctype html><html><body><div id="root"></div></body></html>'
);
const previousGlobals = new Map();
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node
})) {
  previousGlobals.set(key, globalThis[key]);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const source = `
  import React from 'react';
  import { create, observer } from './dist/local.js';

  export const useStore = create((set) => ({
    user: { name: 'Michael', age: 30 },
    setName(name) { set(() => { this.user.name = name; }); },
    setAge(age) { set(() => { this.user.age = age; }); }
  }));

  // React Compiler bails out of any component that writes to an outer binding
  // straight from its render body, and a component it skipped would not
  // exercise what this check exists to prove. Renders are counted from an
  // effect with no dependency array, which runs once per committed render;
  // the selector call is counted inside the callback, which the compiler
  // already treats as an effectful boundary.
  const counts = { observerRenders: 0, selectorRenders: 0, selectorRuns: 0 };

  function ObserverCounter() {
    React.useEffect(() => { counts.observerRenders += 1; });
    const state = useStore();
    return <span id="observer-value">{state.user.name}</span>;
  }

  export const CompiledObserver = observer(ObserverCounter);

  export function CompiledSelector() {
    React.useEffect(() => { counts.selectorRenders += 1; });
    const name = useStore((state) => {
      counts.selectorRuns += 1;
      return state.user.name;
    });
    return <span id="selector-value">{name}</span>;
  }

  export const counters = () => ({ ...counts });
`;

const compiled = transformSync(source, {
  filename: join(reactPackageDir, 'compiler-integration-fixture.tsx'),
  configFile: false,
  babelrc: false,
  sourceType: 'module',
  parserOpts: { plugins: ['jsx', 'typescript'] },
  plugins: [[reactCompiler, { target: '19' }]],
  presets: [
    [presetReact, { runtime: 'automatic' }],
    [presetEnv, { targets: { node: 'current' }, modules: 'commonjs' }]
  ]
})?.code;

if (!compiled) {
  throw new Error('React Compiler produced no output.');
}
if (
  !compiled.includes('react/compiler-runtime') &&
  !compiled.includes('react.memo_cache_sentinel')
) {
  throw new Error('React Compiler did not optimize the integration fixture.');
}

const module = { exports: {} };
const execute = new Function('require', 'module', 'exports', compiled);
execute(packageRequire, module, module.exports);
const fixture = module.exports;
const ReactDOMClient = packageRequire('react-dom/client');
const container = dom.window.document.getElementById('root');
const root = ReactDOMClient.createRoot(container);

try {
  await act(async () => {
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(fixture.CompiledObserver),
        React.createElement(fixture.CompiledSelector)
      )
    );
  });
  const initial = fixture.counters();
  if (container.querySelector('#observer-value')?.textContent !== 'Michael') {
    throw new Error('Compiled observer did not render its initial value.');
  }
  if (container.querySelector('#selector-value')?.textContent !== 'Michael') {
    throw new Error('Compiled selector did not render its initial value.');
  }

  await act(async () => {
    fixture.useStore.getState().setAge(31);
  });
  const afterSibling = fixture.counters();
  if (afterSibling.observerRenders !== initial.observerRenders) {
    throw new Error(
      'Compiled observer re-rendered for an unrelated sibling path.'
    );
  }
  if (afterSibling.selectorRenders !== initial.selectorRenders) {
    throw new Error(
      'Compiled selector component re-rendered for an unrelated sibling path.'
    );
  }
  if (afterSibling.selectorRuns !== initial.selectorRuns) {
    throw new Error('Compiled selector re-ran for an unrelated sibling path.');
  }

  await act(async () => {
    fixture.useStore.getState().setName('Lin');
  });
  const afterTarget = fixture.counters();
  if (container.querySelector('#observer-value')?.textContent !== 'Lin') {
    throw new Error('Compiled observer did not update for its tracked path.');
  }
  if (container.querySelector('#selector-value')?.textContent !== 'Lin') {
    throw new Error('Compiled selector did not update for its tracked path.');
  }
  if (afterTarget.observerRenders <= afterSibling.observerRenders) {
    throw new Error(
      'Compiled observer did not re-render for its tracked path.'
    );
  }
  if (afterTarget.selectorRuns <= afterSibling.selectorRuns) {
    throw new Error('Compiled selector did not re-run for its tracked path.');
  }
} finally {
  await act(async () => root.unmount());
  fixture.useStore.destroy();
  dom.window.close();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  for (const [key, value] of previousGlobals) {
    if (typeof value === 'undefined') delete globalThis[key];
    else globalThis[key] = value;
  }
}

console.log(
  'React Compiler runtime integration passed for observer + tracked selector.'
);
