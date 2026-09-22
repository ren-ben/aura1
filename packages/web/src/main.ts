import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';

createApp(App).mount('#app');

// Installable on the phone; the service worker keeps the shell available offline.
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_DEMO) {
  navigator.serviceWorker.register('/sw.js');
}
