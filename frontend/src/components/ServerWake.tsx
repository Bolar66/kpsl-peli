import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_URL } from '../config';

const SHOW_AFTER_MS = 1500;
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_MS = 2000;

// Ilmainen palvelin nukahtaa, kun kukaan ei pelaa, ja herääminen kestää jopa minuutin.
// Sivu tulee silloin välimuistista (service worker), ja tämä näkymä kertoo mitä odotetaan.
export default function ServerWake() {
  const [waking, setWaking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let ready = false;
    const showTimer = setTimeout(() => { if (!ready) setWaking(true); }, SHOW_AFTER_MS);
    const startedAt = Date.now();
    const ticker = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    async function check() {
      while (!cancelled) {
        const controller = new AbortController();
        const abort = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(`${API_URL}/health`, { signal: controller.signal, cache: 'no-store' });
          if (res.ok) break;
        } catch { /* palvelin ei vielä vastaa */ }
        finally { clearTimeout(abort); }
        await new Promise(r => setTimeout(r, RETRY_MS));
      }
      ready = true;
      clearInterval(ticker);
      if (!cancelled) setWaking(false);
    }
    check();

    return () => {
      cancelled = true;
      clearTimeout(showTimer);
      clearInterval(ticker);
    };
  }, []);

  return (
    <AnimatePresence>
      {waking && (
        <motion.div
          className="server-wake"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
          aria-live="polite"
        >
          <div className="wake-hands" aria-hidden="true">
            <span>✊</span><span>✋</span><span>✌️</span>
          </div>
          <h2>Herätetään palvelinta…</h2>
          <p className="muted">
            Palvelin nukahtaa, kun kukaan ei ole pelannut hetkeen. Herääminen kestää yleensä alle minuutin.
          </p>
          <p className="faint wake-seconds">{seconds} s</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
