import type { Slice } from 'coaction';

export interface WindowShape {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowMetaData {
  // example metadata
  foo: string;
}

export interface WindowInfo {
  id: number;
  shape: WindowShape;
  metaData: WindowMetaData;
}

export interface WindowsManager {
  tabCount: number;
  windows: WindowInfo[];
  init({
    shape,
    metaData
  }: {
    shape: WindowShape;
    metaData: WindowMetaData;
  }): number;
  update({ id, shape }: { id: number; shape: WindowShape }): void;
  remove({ id }: { id: number }): void;
}

export const windowsManager: Slice<WindowsManager> = (set) => ({
  tabCount: 0,
  windows: [],
  init({ shape, metaData }) {
    set(() => {
      this.tabCount++;
      this.windows.push({
        id: this.tabCount,
        shape,
        metaData
      });
    });
    return this.tabCount;
  },
  update({ id, shape }) {
    set(() => {
      const idx = this.windows.findIndex((w) => w.id === id);
      if (idx > -1) {
        this.windows[idx].shape = shape;
      }
    });
  },
  remove({ id }) {
    set(() => {
      const idx = this.windows.findIndex((w) => w.id === id);
      if (idx > -1) {
        this.windows.splice(idx, 1);
      }
    });
  }
});
