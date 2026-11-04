import { useNavigate } from 'react-router-dom';
import './Lobby.css';
import './Profile.css';

// Ylläpitäjän yhteystieto tietosuojaselosteeseen (GDPR edellyttää rekisterinpitäjän yhteystiedot)
const CONTACT = 'Ville Kantonen, villekkantonen@gmail.com';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <div className="lobby-page">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Takaisin">←</button>
        <span className="eyebrow">Tietosuoja</span>
        <span style={{ width: 40 }} />
      </header>

      <main className="lobby-main privacy">
        <h1>Tietosuojaseloste</h1>
        <p className="muted">Lyhyesti: tallennamme vain sen, mitä peli tarvitsee toimiakseen. Ei mainoksia, ei seurantaa.</p>

        <section className="card">
          <h2>Mitä tietoja tallennetaan</h2>
          <ul>
            <li><b>Nimimerkki</b> ja, jos olet luonut tunnuksen, <b>salasana</b> salattuna (bcrypt). Salasanaa ei voi lukea selväkielisenä.</li>
            <li><b>Profiilikuva</b>, jos lisäät sellaisen (emoji, väri tai oma kuva).</li>
            <li><b>Pelitiedot:</b> pelatut pelit, kierrosten valinnat ja niistä lasketut tilastot.</li>
            <li><b>Palaute</b>, jos lähetät sellaisen: viesti, nimimerkkisi sekä selaimen ja laitteen tyyppi vikojen selvittämistä varten.</li>
          </ul>
          <p className="muted">Nimimerkkisi ja profiilikuvasi näkyvät muille pelaajille samassa huoneessa.</p>
        </section>

        <section className="card">
          <h2>Miksi</h2>
          <p className="muted">Tietoja käytetään vain pelin toteuttamiseen: kirjautumiseen, peliin ja omien tilastojesi näyttämiseen. Käsittelyn peruste on pelipalvelun tarjoaminen sinulle.</p>
        </section>

        <section className="card">
          <h2>Missä tiedot ovat</h2>
          <p className="muted">Palvelin toimii Render-palvelussa ja tietokanta Neon-palvelussa EU:n alueella. Tietoja ei luovuteta muille. Peli ei käytä evästeitä eikä analytiikkaa; kirjautuminen säilytetään vain omassa selaimessasi.</p>
        </section>

        <section className="card">
          <h2>Oikeutesi</h2>
          <p className="muted">Voit muokata nimimerkkiäsi ja profiilikuvaasi profiilissa. Voit poistaa tilisi ja kaikki siihen liittyvät tiedot pysyvästi kohdasta <b>Profiili → Poista tili</b>. Muissa tietosuoja-asioissa ota yhteyttä ylläpitäjään.</p>
          <p className="muted">Ylläpitäjä: {CONTACT}</p>
        </section>
        <section className="card">
          <h2>Musiikki</h2>
          <p className="muted">
            “Lofi again” (omfgdude) ja “Kuia” (cinameng / James Gargette), molemmat CC0-lisenssillä,{' '}
            <a href="https://opengameart.org" target="_blank" rel="noreferrer">OpenGameArt.org</a>. Kiitos tekijöille!
          </p>
        </section>
      </main>
    </div>
  );
}
