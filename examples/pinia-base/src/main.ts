import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { useStore } from './store';

const worker = new SharedWorker(new URL('./store.ts', import.meta.url), {
  type: 'module'
});

const useWorkerStore = useStore({
  worker
});

globalThis.useWorkerStore = useWorkerStore;

globalThis.useStore = useStore;

const app = createApp(App);

console.log('process.env.NODE_ENV', process.env.NODE_ENV);

app.mount('#app');
