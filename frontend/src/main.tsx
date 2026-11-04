import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setupInstall } from './constants/install';
import './constants/theme';
// Fontit ladataan omalta palvelimelta (ei Googlen palvelimilta → ei IP-osoitteiden siirtoa kolmannelle osapuolelle)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './index.css';

setupInstall();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
