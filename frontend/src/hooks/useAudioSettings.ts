import { useSyncExternalStore } from 'react';
import { getAudioSettings, subscribeAudioSettings } from '../constants/audioEngine';

// Äänenvoimakkuusasetukset React-komponenteille (päivittyy kun asetuksia muutetaan missä tahansa)
export function useAudioSettings() {
  return useSyncExternalStore(subscribeAudioSettings, getAudioSettings);
}
