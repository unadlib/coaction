// @ts-nocheck
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { makeAutoObservable, runInAction } from 'mobx';
import { createPinia, defineStore, setActivePinia } from 'pinia';
import { bindMobx } from '../../coaction-mobx/src';
import { adapt as adaptPinia, bindPinia } from '../../coaction-pinia/src';
import {
  adapt as adaptValtio,
  bindValtio,
  proxy
} from '../../coaction-valtio/src';
import { create } from '../src';

type MutableAdapterCase = {
  createStore: () => {
    externalUpdate: () => void;
    useStore: any;
  };
  name: string;
};

const cases: MutableAdapterCase[] = [
  {
    name: 'mobx',
    createStore: () => {
      const state = makeAutoObservable(
        bindMobx({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
      );
      return {
        useStore: create(() => state, {
          name: 'react-mobx'
        }),
        externalUpdate: () => {
          runInAction(() => {
            state.count += 1;
          });
        }
      };
    }
  },
  {
    name: 'valtio',
    createStore: () => {
      const state = proxy(
        bindValtio({
          count: 0,
          increment() {
            this.count += 1;
          }
        })
      );
      return {
        useStore: create(() => adaptValtio(state), {
          name: 'react-valtio'
        }),
        externalUpdate: () => {
          state.count += 1;
        }
      };
    }
  },
  {
    name: 'pinia',
    createStore: () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const useCounterStore = defineStore(
        'react-pinia-counter',
        bindPinia({
          state: () => ({
            count: 0
          }),
          actions: {
            increment() {
              this.count += 1;
            }
          }
        })
      );
      const state = useCounterStore();
      return {
        useStore: create(() => adaptPinia(state), {
          name: 'react-pinia'
        }),
        externalUpdate: () => {
          (state as any).$patch({
            count: (state as any).count + 1
          });
        }
      };
    }
  }
];

describe.each(cases)(
  'mutable adapter integration: $name',
  ({ createStore }) => {
    test('rerenders full state, selector, and auto selector readers', async () => {
      const { useStore, externalUpdate } = createStore();
      const selectors = useStore.auto();

      const FullStateCounter = () => {
        const state = useStore();
        return React.createElement(
          'span',
          { 'data-testid': 'full' },
          state.count
        );
      };

      const SelectorCounter = () => {
        const count = useStore((state) => state.count);
        return React.createElement(
          'span',
          { 'data-testid': 'selector' },
          count
        );
      };

      const AutoSelectorCounter = () => {
        const count = useStore(selectors.count);
        return React.createElement('span', { 'data-testid': 'auto' }, count);
      };

      render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(FullStateCounter),
          React.createElement(SelectorCounter),
          React.createElement(AutoSelectorCounter)
        ) as any
      );

      expect(screen.getByTestId('full').textContent).toBe('0');
      expect(screen.getByTestId('selector').textContent).toBe('0');
      expect(screen.getByTestId('auto').textContent).toBe('0');

      await act(async () => {
        externalUpdate();
      });

      await waitFor(() => {
        expect(screen.getByTestId('full').textContent).toBe('1');
        expect(screen.getByTestId('selector').textContent).toBe('1');
        expect(screen.getByTestId('auto').textContent).toBe('1');
      });

      await act(async () => {
        useStore.getState().increment();
      });

      await waitFor(() => {
        expect(screen.getByTestId('full').textContent).toBe('2');
        expect(screen.getByTestId('selector').textContent).toBe('2');
        expect(screen.getByTestId('auto').textContent).toBe('2');
      });
    });
  }
);
