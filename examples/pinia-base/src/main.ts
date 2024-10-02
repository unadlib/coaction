import { createApp } from 'vue';
import { createPinia } from 'pinia';
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

const app = createApp(App);

app.mount('#app');
