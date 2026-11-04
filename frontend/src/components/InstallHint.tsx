import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '../constants/install';

const DISMISS_KEY = 'kpsl-install-dismissed';

// Safarin Jaa-kuvake (neliö ja ylöspäin osoittava nuoli), jotta oikea nappi on helppo tunnistaa
function ShareIcon() {
  return (
    <svg className="share-glyph" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function wasDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

// Vihje lisätä peli kotinäytölle. Näytetään vain puhelimessa selaimen kautta pelattaessa,
// ja sen voi sulkea pysyvästi.
export default function InstallHint() {
  const [, rerender] = useState(0);
  const [dismissed, setDismissed] = useState(wasDismissed);
  useEffect(() => onInstallChange(() => rerender(n => n + 1)), []);

  const ios = isIos();
  const show = !dismissed && !isStandalone() && (ios || canPromptInstall());

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* yksityinen selaus */ }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="install-hint"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: -14 }}
          transition={{ duration: 0.3 }}
        >
          <img src="/icon-192.png" alt="" className="install-icon" />
          <div className="install-text">
            <b>Lisää peli kotinäytölle</b>
            {ios ? (
              <span>Napauta Safarin <ShareIcon /> Jaa-nappia ja valitse ”Lisää Koti-valikkoon”.</span>
            ) : (
              <span>Avautuu kuin sovellus.</span>
            )}
          </div>
          {!ios && <button className="btn btn-primary install-btn" onClick={promptInstall}>Asenna</button>}
          <button className="install-close" onClick={dismiss} aria-label="Sulje vihje">✕</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
