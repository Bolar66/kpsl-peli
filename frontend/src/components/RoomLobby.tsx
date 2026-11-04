import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MODE_LABEL, type GameMode } from '../constants/symbols';
import Avatar, { type AvatarData } from './Avatar';
import Modal from './Modal';
import ChatBubble, { type BubbleData } from './ChatBubble';
import InviteFriendsSheet from './InviteFriendsSheet';

export interface LobbySettings {
  mode: GameMode;
  winsRequired: number;
  speed: 'fast' | 'relaxed';
  firstRoundSeconds: number;
  laterRoundSeconds: number;
  roundGap: number;
}

interface LobbyPlayer extends AvatarData {
  isHost: boolean;
  isConnected: boolean;
  isBot: boolean;
}

interface RoomLobbyProps {
  roomCode: string;
  players: LobbyPlayer[];
  myUserId: number | undefined;
  matchWins: Record<number, number>;
  bubbles: Record<number, BubbleData>;
  isHost: boolean;
  settings: LobbySettings;
  onChange: (settings: LobbySettings) => void;
  onStart: () => void;
  onAddBot: () => void;
  onRemoveBot: (userId: number) => void;
}

const MAX_PLAYERS = 4;

function Stepper({ value, min, max, suffix, disabled, onChange, label }: {
  value: number; min: number; max: number; suffix?: string; disabled: boolean; onChange: (v: number) => void; label: string;
}) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`Vähennä: ${label}`}>−</button>
      <span>{value}{suffix}</span>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`Lisää: ${label}`}>+</button>
    </div>
  );
}

function Segmented<T extends string>({ options, value, disabled, onChange }: {
  options: { value: T; label: string }[]; value: T; disabled: boolean; onChange: (v: T) => void;
}) {
  return (
    <div className={`seg ${disabled ? 'readonly' : ''}`} role="radiogroup">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function RoomLobby({
  roomCode, players, matchWins, bubbles, myUserId, isHost, settings, onChange, onStart, onAddBot, onRemoveBot,
}: RoomLobbyProps) {
  const [copied, setCopied] = useState(false);
  const [showTimes, setShowTimes] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const host = players.find(p => p.isHost);
  const enoughPlayers = players.length >= 2;
  const readOnly = !isHost;

  const set = <K extends keyof LobbySettings>(key: K, value: LobbySettings[K]) => onChange({ ...settings, [key]: value });

  async function handleShare() {
    const url = `${window.location.origin}/room/${roomCode}`;
    const text = `Tule pelaamaan ${settings.mode === 'extended' ? 'kivi-paperi-sakset-lisko-Spockia' : 'kivi-paperi-saksia'}! Huonekoodi ${roomCode}`;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'BOWL', text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Käyttäjä perui jakamisen tai leikepöytä ei ole käytössä — ei tehdä mitään
    }
  }

  return (
    <motion.div
      className="room-lobby"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <section className="code-block">
        <div>
          <p className="eyebrow">Huonekoodi</p>
          <div className="code-big" aria-label={`Huonekoodi ${roomCode.split('').join(' ')}`}>
            {roomCode.split('').map((c, i) => <span key={i}>{c}</span>)}
          </div>
        </div>
        <div className="invite-buttons">
          <button className="btn btn-primary btn-sm share-btn" onClick={() => setInviteOpen(true)}>👥 Kutsu kavereita</button>
          <button className="btn btn-secondary btn-sm share-btn" onClick={handleShare}>
            {copied ? '✓ Kopioitu' : 'Jaa linkki'}
          </button>
        </div>
      </section>
      <InviteFriendsSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roomCode={roomCode}
        memberIds={players.map(p => p.userId)}
      />

      <section className="card lobby-section">
        <div className="section-head">
          <h2>Pelaajat</h2>
          <span className="faint">{players.length}/{MAX_PLAYERS}</span>
        </div>
        <ul className="player-slots">
          <AnimatePresence initial={false}>
            {players.map((p, index) => (
              <motion.li
                key={p.userId}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 400, damping: 24 }}
              >
                <span className="slot-avatar">
                  <Avatar player={p} size={46} />
                  {/* Reunimmaisten kupla ankkuroidaan reunasta, ettei se mene ruudun yli */}
                  <ChatBubble bubble={bubbles[p.userId] ?? null} side={index === 0 ? 'up-start' : index === 3 ? 'up-end' : 'up'} />
                  {p.isHost && <span className="slot-host">Host</span>}
                  {(matchWins[p.userId] ?? 0) > 0 && (
                    <span className="match-wins" title="Voitetut pelit tässä huoneessa">👑{matchWins[p.userId]}</span>
                  )}
                  {p.isBot && isHost && (
                    <button className="remove-bot" onClick={() => onRemoveBot(p.userId)} aria-label={`Poista ${p.username}`}>×</button>
                  )}
                </span>
                <span className={`slot-name ${p.userId === myUserId ? 'me' : ''}`}>
                  {p.userId === myUserId ? 'Sinä' : p.username}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {Array.from({ length: MAX_PLAYERS - players.length }).map((_, i) => (
            <li key={`empty-${i}`}>
              {isHost && i === 0 ? (
                <button className="slot-avatar slot-add" onClick={onAddBot} aria-label="Lisää botti">+</button>
              ) : (
                <span className="slot-avatar slot-empty" />
              )}
              <span className="slot-name faint">{isHost && i === 0 ? 'Lisää botti' : 'Vapaa'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card lobby-section">
        <div className="section-head">
          <h2>Asetukset</h2>
          {readOnly && <span className="faint">Host valitsee</span>}
        </div>

        <Segmented
          options={[{ value: 'classic', label: MODE_LABEL.classic }, { value: 'extended', label: MODE_LABEL.extended }]}
          value={settings.mode}
          disabled={readOnly}
          onChange={v => set('mode', v)}
        />

        <div className="setting-grid">
          <div className="setting">
            <span className="setting-label">Voittoon</span>
            <Stepper label="Voittoon tarvitaan" value={settings.winsRequired} min={1} max={10} disabled={readOnly} onChange={v => set('winsRequired', v)} />
          </div>
          <div className="setting">
            <span className="setting-label">Tahti</span>
            <Segmented
              options={[{ value: 'fast', label: 'Nopea' }, { value: 'relaxed', label: 'Rauhallinen' }]}
              value={settings.speed}
              disabled={readOnly}
              onChange={v => set('speed', v)}
            />
          </div>
        </div>

        <button className="disclosure" onClick={() => setShowTimes(true)}>
          <span>Ajat</span>
          <span className="faint">
            {settings.firstRoundSeconds}s · {settings.laterRoundSeconds}s{settings.speed === 'fast' ? ` · tauko ${settings.roundGap}s` : ''}
          </span>
          <span className="chev">›</span>
        </button>
      </section>

      <Modal open={showTimes} label="Ajat" onBackdrop={() => setShowTimes(false)}>
        <h2 className="sheet-title">Ajat</h2>
        <p className="sheet-sub">
          {settings.speed === 'fast'
            ? 'Nopeassa tahdissa seuraava kierros alkaa automaattisesti tauon jälkeen.'
            : 'Rauhallisessa tahdissa jokainen kuittaa olevansa valmis ennen seuraavaa kierrosta.'}
        </p>
        <div className="setting setting-row">
          <span className="setting-label">Ensimmäinen kierros</span>
          <Stepper label="Ensimmäinen kierros" value={settings.firstRoundSeconds} min={5} max={20} suffix="s" disabled={readOnly} onChange={v => set('firstRoundSeconds', v)} />
        </div>
        <div className="setting setting-row">
          <span className="setting-label">Muut kierrokset</span>
          <Stepper label="Muut kierrokset" value={settings.laterRoundSeconds} min={3} max={15} suffix="s" disabled={readOnly} onChange={v => set('laterRoundSeconds', v)} />
        </div>
        {settings.speed === 'fast' && (
          <div className="setting setting-row">
            <span className="setting-label">Tauko kierrosten välissä</span>
            <Stepper label="Tauko kierrosten välissä" value={settings.roundGap} min={2} max={10} suffix="s" disabled={readOnly} onChange={v => set('roundGap', v)} />
          </div>
        )}
        <button className="btn btn-primary btn-block" onClick={() => setShowTimes(false)}>Valmis</button>
      </Modal>

      <div className="lobby-cta">
        {isHost ? (
          <button className="btn btn-primary btn-block" onClick={onStart} disabled={!enoughPlayers}>
            {enoughPlayers ? 'Aloita peli' : 'Odotetaan pelaajia…'}
          </button>
        ) : (
          <p className="waiting-host">
            <span className="dot-pulse" /> Odotetaan, että {host?.username ?? 'host'} aloittaa pelin
          </p>
        )}
      </div>
    </motion.div>
  );
}
