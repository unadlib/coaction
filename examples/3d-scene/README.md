# 3D Scene

This example demonstrates how to create a shared store for supporting multiple browser windows in a 3D scene with a rotating cube.

## Usage

We can easily create a shared store for managing multiple windows in a 3D scene. The store can be used to create, update, and remove windows.

```ts
const windowsManager: Slice<WindowsManager> = (set) => ({
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
```

## Credits

- [Three.js](https://threejs.org/)
- [multipleWindow3dScene](https://github.com/bgstaal/multipleWindow3dScene)
