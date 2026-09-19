import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');

// Installable on the phone; the service worker keeps the shell available offline.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js');
}
