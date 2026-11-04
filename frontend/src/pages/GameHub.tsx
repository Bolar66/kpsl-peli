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
import './Lobby.css';

// Tulevat pelit näytetään valikossa lukittuina, jotta pelaajat näkevät mitä on tulossa
const COMING_SOON = [
  { emoji: '🧠', title: 'Tietovisa', text: 'Kuka tietää eniten?' },
  { emoji: '🌍', title: 'Lippuvisa', text: 'Tunnista maat lipuista' },
  { emoji: '🎲', title: 'Noppapelit', text: 'Tuuria ja taktiikkaa' },
];

// Pelivalikko: kirjautumisen jälkeen ensimmäinen näkymä, josta valitaan pelattava peli
export default function GameHub() {
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(hasUnseenWhatsNew);

  return (
    <div className="lobby-page">
      <AppHeader left={<BowlLogo size={30} />} />
      <FeedbackSheet open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <WhatsNew open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />

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
          <div className="game-card-art" aria-hidden="true">
            <span>✊</span><span>✋</span><span>✌️</span>
          </div>
          <div className="game-card-body">
            <p className="eyebrow">2–4 pelaajaa · reaaliajassa</p>
            <h2 className="game-card-title">Kivi, paperi, sakset</h2>
            <p className="muted game-card-text">Klassinen tai Lisko–Spock. Luo huone ja kutsu kaverit.</p>
          </div>
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
