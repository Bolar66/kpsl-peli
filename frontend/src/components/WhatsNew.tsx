import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Modal from './Modal';
import { BowlMark } from './BowlLogo';
import { markWhatsNewSeen } from '../constants/whatsNew';

const SLIDES = [
  {
    art: <span className="whats-new-emoji">🌍</span>,
    title: 'Uusi peli: Lippuvisa',
    text: 'Tunnista maailman liput neljällä tasolla: Turisti, Reppureissaaja, Maailmanmatkaaja ja Arpajaiset. Pelaa yksin ja tee ennätyksiä, tai haasta kaverit samaan huoneeseen.',
    tip: 'Kirjoitusvastauksissa kelpaavat suomen- ja englanninkieliset nimet, ja pienestä kirjoitusvirheestä saa puolet pisteistä.',
  },
  {
    art: <BowlMark size={72} />,
    title: 'Uusi nimi: BOWL',
    text: 'KPSL on nyt BOWL — kulhollinen pelejä kavereiden kanssa. Kaikki pelit löytyvät pelivalikosta, ja tietovisat ja noppapelit ovat tulossa.',
    tip: 'iPhonella: poista vanha ikoni ja lisää BOWL uudelleen kotinäytölle, niin saat uuden logon.',
  },
  {
    art: <span className="whats-new-emoji">👥</span>,
    title: 'Kaverit',
    text: 'Yläpalkin 👥-napista löydät oman kaverikoodisi (esim. K7M-4QX). Jaa se kaverille tai syötä hänen koodinsa, niin hän saa kaveripyynnön.',
    tip: 'Kaverilistasta näet, kuka on paikalla ja kuka pelaa juuri nyt. Kaverit vaativat tunnuksen, joten vieraana pelaava lisää ensin salasanan profiilissa.',
  },
  {
    art: <span className="whats-new-emoji">📨</span>,
    title: 'Kutsu peliin',
    text: 'Paina kaverilistassa ”Kutsu peliin”, tai pelihuoneen aulassa ”Kutsu kavereita”. Kaveri saa ilmoituksen, josta pääsee suoraan huoneeseesi.',
    tip: 'Ota ilmoitukset käyttöön Kaverit-sivun alareunasta. iPhonessa ne toimivat, kun BOWL on lisätty kotinäytölle.',
  },
  {
    art: <span className="whats-new-emoji">📊</span>,
    title: 'Profiili ja tilastot',
    text: 'Lisää profiiliisi taustakuva ja lyhyt bio. Kaverit näkevät profiilisi, valintasi ja keskinäiset ottelunne. Tilastoja voi katsoa kaikilta ajoilta, viimeisistä 5 tai 20 pelistä tai 30 päivältä.',
    tip: 'Klikkaa kaveria kaverilistassa, niin näet hänen profiilinsa.',
  },
  {
    art: <span className="whats-new-emoji">🌗</span>,
    title: 'Vaalea teema ja chat',
    text: 'Peli seuraa nyt puhelimen tummaa tai vaaleaa tilaa. Voit valita teeman itse kohdasta Profiili → Ulkoasu.',
    tip: 'Pelin aikana 😀-napista lähetät emoteja ja viestejä, jotka näkyvät puhekuplina pelaajien vieressä.',
  },
];

// Uudistusten esittely: avautuu kerran pelivalikossa ja on avattavissa uudelleen linkistä
export default function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  const slide = SLIDES[index]!;
  const last = index === SLIDES.length - 1;

  function close() {
    markWhatsNewSeen();
    onClose();
  }

  return (
    <Modal open={open} label="Uutta BOWLissa" onBackdrop={close}>
      <div className="whats-new">
        <p className="eyebrow whats-new-eyebrow">Uutta BOWLissa · {index + 1}/{SLIDES.length}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            className="whats-new-slide"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
          >
            <div className="whats-new-art">{slide.art}</div>
            <h2 className="sheet-title">{slide.title}</h2>
            <p className="whats-new-text">{slide.text}</p>
            <p className="whats-new-tip">💡 {slide.tip}</p>
          </motion.div>
        </AnimatePresence>
        <div className="whats-new-dots" aria-hidden="true">
          {SLIDES.map((_, i) => <span key={i} className={i === index ? 'active' : ''} />)}
        </div>
        <div className="whats-new-actions">
          {index > 0
            ? <button className="btn btn-ghost" onClick={() => setIndex(i => i - 1)}>Takaisin</button>
            : <button className="btn btn-ghost" onClick={close}>Ohita</button>}
          <button className="btn btn-primary" onClick={() => (last ? close() : setIndex(i => i + 1))}>
            {last ? 'Aloitetaan!' : 'Seuraava'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
