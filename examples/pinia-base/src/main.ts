import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

const app = createApp(App);

console.log('process.env.NODE_ENV', process.env.NODE_ENV);

app.mount('#app');
