// @ts-nocheck
import { create } from 'coaction';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { runBinderCommitConformance } from '../../core/test/binderCommitConformance';
import { adapt, bindRedux, withCoactionReducer } from '../src';

runBinderCommitConformance({
  packageName: '@coaction/redux',
  createStore: () => {
    const slice = createSlice({
      name: 'conformance',
      initialState: { count: 0, label: 'a' },
      reducers: {}
    });
    const reduxStore = configureStore({
      reducer: withCoactionReducer(slice.reducer)
    });
    return { store: create(() => adapt(bindRedux(reduxStore))) };
  }
});
