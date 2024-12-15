import { create, type AsyncStore } from 'coaction';
import * as THREE from 'three';
import {
  windowsManager,
  WindowsManager,
  type WindowInfo,
  type WindowMetaData,
  type WindowShape
} from './windowsManager';

type Callback = () => void;

// -----------------------------------
// WindowManager use Shared Worker
// -----------------------------------
class WindowManager {
  private id: number = -1;
  private winData: WindowInfo | null = null;

  private winShapeChangeCallback?: Callback;
  private winChangeCallback?: Callback;
  private store: AsyncStore<WindowsManager>;

  constructor() {
    const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
      type: 'module'
    });
    this.store = create<WindowsManager>(windowsManager, {
      worker
    });
    this.store.subscribe(() => {
      if (this.winChangeCallback) {
        this.winChangeCallback();
      }
    });
    window.addEventListener('beforeunload', async () => {
      if (this.id !== -1) {
        await this.store.getState().remove({ id: this.id });
      }
    });
  }

  get windows(): WindowInfo[] {
    return this.store.getState().windows;
  }

  async init(metaData: WindowMetaData) {
    const shape = this.getWinShape();
    this.winData = { id: this.id, shape, metaData };
    this.id = await this.store.getState().init({ shape, metaData });
    this.winData.id = this.id;
  }

  update() {
    if (!this.winData) return;
    const winShape = this.getWinShape();
    const oldShape = this.winData.shape;

    if (
      winShape.x !== oldShape.x ||
      winShape.y !== oldShape.y ||
      winShape.w !== oldShape.w ||
      winShape.h !== oldShape.h
    ) {
      this.winData.shape = winShape;
      this.store.getState().update({ id: this.id, shape: winShape });
      if (this.winShapeChangeCallback) this.winShapeChangeCallback();
    }
  }

  getWinShape(): WindowShape {
    return {
      x: window.screenLeft,
      y: window.screenTop,
      w: window.innerWidth,
      h: window.innerHeight
    };
  }

  setWinShapeChangeCallback(callback: Callback) {
    this.winShapeChangeCallback = callback;
  }

  setWinChangeCallback(callback: Callback) {
    this.winChangeCallback = callback;
  }

  getWindows(): WindowInfo[] {
    return this.windows;
  }

  getThisWindowData(): WindowInfo | null {
    return this.winData;
  }

  getThisWindowID(): number {
    return this.id;
  }
}

// -----------------------------------
// CubeManager
// -----------------------------------
class CubeManager {
  private world: THREE.Object3D;
  private cubes: THREE.Mesh[] = [];

  constructor(world: THREE.Object3D) {
    this.world = world;
  }

  updateCubes(wins: WindowInfo[]) {
    // remove all existing cubes
    this.cubes.forEach((c) => this.world.remove(c));
    this.cubes = [];

    for (let i = 0; i < wins.length; i++) {
      let win = wins[i];
      let c = new THREE.Color();
      c.setHSL(i * 0.1, 1.0, 0.5);

      let s = 100 + i * 50;
      let cube = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({ color: c, wireframe: true })
      );
      cube.position.x = win.shape.x + win.shape.w * 0.5;
      cube.position.y = win.shape.y + win.shape.h * 0.5;
      this.world.add(cube);
      this.cubes.push(cube);
    }
  }

  animateCubes(wins: WindowInfo[], t: number, falloff: number) {
    for (let i = 0; i < this.cubes.length; i++) {
      let cube = this.cubes[i];
      let win = wins[i];
      let posTarget = {
        x: win.shape.x + win.shape.w * 0.5,
        y: win.shape.y + win.shape.h * 0.5
      };

      cube.position.x += (posTarget.x - cube.position.x) * falloff;
      cube.position.y += (posTarget.y - cube.position.y) * falloff;
      cube.rotation.x = t * 0.5;
      cube.rotation.y = t * 0.3;
    }
  }
}

// -----------------------------------
// SceneManager
// -----------------------------------
class SceneManager {
  private pixR: number;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private world!: THREE.Object3D;

  private sceneOffset = { x: 0, y: 0 };
  private sceneOffsetTarget = { x: 0, y: 0 };

  constructor(pixR: number = 1) {
    this.pixR = pixR;
  }

  init() {
    this.camera = new THREE.OrthographicCamera(
      0,
      window.innerWidth,
      0,
      window.innerHeight,
      -10000,
      10000
    );
    this.camera.position.z = 2.5;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0.0);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, depth: true });
    this.renderer.setPixelRatio(this.pixR);

    this.world = new THREE.Object3D();
    this.scene.add(this.world);

    this.renderer.domElement.setAttribute('id', 'scene');
    document.body.appendChild(this.renderer.domElement);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setSceneOffsetTarget(x: number, y: number, useEasing: boolean = true) {
    this.sceneOffsetTarget = { x, y };
    if (!useEasing) {
      this.sceneOffset = { x, y };
    }
  }

  updateSceneOffset(falloff: number = 0.05) {
    this.sceneOffset.x +=
      (this.sceneOffsetTarget.x - this.sceneOffset.x) * falloff;
    this.sceneOffset.y +=
      (this.sceneOffsetTarget.y - this.sceneOffset.y) * falloff;
    this.world.position.x = this.sceneOffset.x;
    this.world.position.y = this.sceneOffset.y;
  }

  resize() {
    let width = window.innerWidth;
    let height = window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      0,
      width,
      0,
      height,
      -10000,
      10000
    );
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  getWorld(): THREE.Object3D {
    return this.world;
  }
}

// -----------------------------------
// App
// -----------------------------------
class App {
  private initialized: boolean = false;
  private windowManager!: WindowManager;
  private sceneManager!: SceneManager;
  private cubeManager!: CubeManager;

  private today: number;
  private falloff: number = 0.05;

  constructor() {
    this.today = this.getTodayStart();
    this.setupVisibilityChange();
    this.setupOnLoad();
  }

  private getTodayStart(): number {
    let today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }

  private getTime(): number {
    return (new Date().getTime() - this.today) / 1000.0;
  }

  private setupVisibilityChange() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden' && !this.initialized) {
        this.init();
      }
    });
  }

  private setupOnLoad() {
    window.onload = () => {
      if (document.visibilityState !== 'hidden') {
        this.init();
      }
    };
  }

  private init() {
    if (!this.initialized) {
      this.initialized = true;
      setTimeout(() => {
        this.setupScene();
        this.setupWindowManager();
        this.updateWindowShape(false);
        this.renderLoop();
      }, 500);
    }
  }

  private setupScene() {
    let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
    this.sceneManager = new SceneManager(pixR);
    this.sceneManager.init();
    this.cubeManager = new CubeManager(this.sceneManager.getWorld());
  }

  private setupWindowManager() {
    this.windowManager = new WindowManager();
    this.windowManager.setWinShapeChangeCallback(() =>
      this.updateWindowShape()
    );
    this.windowManager.setWinChangeCallback(() => this.windowsUpdated());

    let metaData: WindowMetaData = { foo: 'bar' };
    this.windowManager.init(metaData);
    this.windowsUpdated();
  }

  private windowsUpdated() {
    let wins = this.windowManager.getWindows();
    this.cubeManager.updateCubes(wins);
  }

  private updateWindowShape(easing: boolean = true) {
    this.sceneManager.setSceneOffsetTarget(
      -window.screenX,
      -window.screenY,
      easing
    );
  }

  private renderLoop() {
    let t = this.getTime();
    this.windowManager.update();
    this.sceneManager.updateSceneOffset(this.falloff);

    let wins = this.windowManager.getWindows();
    this.cubeManager.animateCubes(wins, t, this.falloff);

    this.sceneManager.render();
    requestAnimationFrame(() => this.renderLoop());
  }
}

// start the app
new App();
