import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './App.css';
import './pages/Room.css'; // sisältää yhteiset .btn-tyylit

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);