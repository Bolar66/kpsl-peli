import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import BowlLogo from '../components/BowlLogo';
import FeedbackSheet from '../components/FeedbackSheet';
import InstallHint from '../components/InstallHint';
import WhatsNew from '../components/WhatsNew';
import { hasUnseenWhatsNew } from '../constants/whatsNew';
import PushPrompt from '../components/PushPrompt';
import { shouldPromptPush } from '../constants/push';
import './Lobby.css';

// Tulevat pelit näytetään valikossa lukittuina, jotta pelaajat näkevät mitä on tulossa
const COMING_SOON = [
  { emoji: '🧠', title: 'Tietovisa', text: 'Kuka tietää eniten?' },
  { emoji: '🎲', title: 'Noppapelit', text: 'Tuuria ja taktiikkaa' },
];

// Pelivalikko: kirjautumisen jälkeen ensimmäinen näkymä, josta valitaan pelattava peli
export default function GameHub() {
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(hasUnseenWhatsNew);
  const [pushPromptOpen, setPushPromptOpen] = useState(shouldPromptPush);

  return (
    <div className="lobby-page">
      <AppHeader left={<BowlLogo size={30} />} />
      <FeedbackSheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <WhatsNew open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
      {/* Ilmoituksista kysytään esittelyn jälkeen */}
      <PushPrompt open={pushPromptOpen && !whatsNewOpen} onClose={() => setPushPromptOpen(false)} />

      <motion.main
        className="lobby-main"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="lobby-hero">
          <h1>Mitä pelataan{user ? `, ${user.username}` : ''}?</h1>
        </div>

        <InstallHint />

        <Link to="/kpsl" className="card game-card">
          <span className="game-card-art" aria-hidden="true">✊</span>
          <span className="game-card-body">
            <b className="game-card-title">Kivi, paperi, sakset</b>
            <span className="muted game-card-text">Klassinen tai Lisko–Spock · 2–4 pelaajaa</span>
          </span>
          <span className="game-card-go" aria-hidden="true">→</span>
        </Link>

        <Link to="/lippu" className="card game-card">
          <span className="game-card-art flag" aria-hidden="true"><img src="/flags/fi.svg" alt="" /></span>
          <span className="game-card-body">
            <b className="game-card-title">Lippuvisa</b>
            <span className="muted game-card-text">Neljä tasoa · yksin tai kavereiden kanssa</span>
          </span>
          <span className="game-card-go" aria-hidden="true">→</span>
        </Link>

        <section className="coming-soon" aria-label="Tulossa">
          <p className="eyebrow">Tulossa</p>
          <div className="coming-grid">
            {COMING_SOON.map(g => (
              <div key={g.title} className="coming-card">
                <span className="coming-emoji" aria-hidden="true">{g.emoji}</span>
                <b>{g.title}</b>
                <span>{g.text}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="hub-links">
          <button className="feedback-link" onClick={() => setWhatsNewOpen(true)}>
            <span>Mitä uutta?</span>
          </button>
          <button className="feedback-link" onClick={() => setFeedbackOpen(true)}>
            Bugi tai idea? <span>Anna palautetta</span>
          </button>
        </div>
      </motion.main>
    </div>
  );
}
