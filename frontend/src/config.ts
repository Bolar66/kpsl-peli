// Palvelimen osoite. Tyhjä = sama osoite kuin mistä sivu ladattiin
// (kehityksessä Viten proxy ohjaa /api- ja /socket.io-pyynnöt backendille).
// Erillisellä palvelimella aseta VITE_SERVER_URL, esim. https://kpsl-backend.example.com
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';
export const API_URL = `${SERVER_URL}/api`;
