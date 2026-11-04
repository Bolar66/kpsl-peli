import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { SERVER_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import ChatSheet from '../components/ChatSheet';
import InviteFriendsSheet from '../components/InviteFriendsSheet';
import type { BubbleData } from '../components/ChatBubble';
import {
  FlagGameOverView, FlagPlayerChips, FlagQuestionView, FlagRevealView, FlagSettingsPanel,
  type FlagOver, type FlagPlayer, type FlagQuestion, type FlagReveal, type HintState,
} from '../components/FlagViews';
import { BUBBLE_MS, EMOTE_BUBBLE_MS, isBigEmoji, type ChatMessage } from '../constants/chat';
import { LEVEL_BY_VALUE, type QuizSettings } from '../constants/flags';
import { sfx, crowdFx } from '../constants/sound';
import { setMusic } from '../constants/music';
import { haptic } from '../constants/players';
import './Lobby.css';
import './Room.css';
import './Flags.css';

type Phase = 'lobby' | 'starting' | 'question' | 'reveal' | 'over';

interface RoomInfo {
  roomCode: string;
  hostId: number;
  solo: boolean;
  phase: Phase;
  settings: QuizSettings;
  players: FlagPlayer[];
}

// Lippuvisan huone: aula ja asetukset, kysymykset, paljastukset ja lopputulos (yksin- ja moninpeli)
export default function FlagRoom() {
  const { roomCode } = useParams();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [question, setQuestion] = useState<FlagQuestion | null>(null);
  const [myAnswer, setMyAnswer] = useState<{ index: number; value: string | number | boolean } | null>(null);
  const [hint, setHint] = useState<HintState | null>(null);
  const [hintsLeft, setHintsLeft] = useState(0);
  const [reveal, setReveal] = useState<FlagReveal | null>(null);
  const [over, setOver] = useState<FlagOver | null>(null);
  const [startingAt, setStartingAt] = useState<number | null>(null);
  const [rejected, setRejected] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, BubbleData>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatOpenRef = useRef(false);
  const myIdRef = useRef<number | undefined>(user?.id);

  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  useEffect(() => { myIdRef.current = user?.id; }, [user?.id]);

  useEffect(() => {
    if (!token || !roomCode) return;
    const s = io(`${SERVER_URL}/flags`, { auth: { token } });
    s.on('connect', () => s.emit('fq:join', { roomCode }));
    s.on('connect_error', (err: Error) => { if (err.message === 'Virheellinen token' || err.message === 'Token puuttuu') logout(); });
    s.on('fq:joinRejected', ({ message }: { message: string }) => setRejected(message));
    s.on('fq:state', (state: RoomInfo & { question: Omit<FlagQuestion, 'receivedAt'> | null; myAnswered: boolean; hintsLeft: number; reveal: FlagReveal | null; over: FlagOver | null; chat: ChatMessage[] }) => {
      setRoom(state);
      setQuestion(state.question ? { ...state.question, receivedAt: Date.now() } : null);
      setHintsLeft(state.hintsLeft);
      setReveal(state.reveal);
      setOver(state.over);
      setChat(state.chat ?? []);
      // Sivun päivitys kesken kysymyksen: aiempaa vastausta ei näy, mutta lisävastaus ohitetaan
      setMyAnswer(state.myAnswered && state.question ? { index: state.question.index, value: '' } : null);
    });
    s.on('fq:room', (info: RoomInfo) => setRoom(info));
    s.on('fq:starting', ({ inMs, hintsLeft: hints }: { inMs: number; hintsLeft: number }) => {
      setHintsLeft(hints);
      setHint(null);
      setOver(null);
      setReveal(null);
      setQuestion(null);
      setStartingAt(Date.now() + inMs);
      sfx.roundStart();
    });
    s.on('fq:question', (q: Omit<FlagQuestion, 'receivedAt'>) => {
      setStartingAt(null);
      setReveal(null);
      setQuestion({ ...q, receivedAt: Date.now() });
      setMyAnswer(null);
      sfx.flip();
    });
    s.on('fq:answered', ({ userId }: { userId: number }) => {
      setRoom(prev => prev && { ...prev, players: prev.players.map(p => (p.userId === userId ? { ...p, answered: true } : p)) });
    });
    s.on('fq:hint', (h: HintState & { hintsLeft: number }) => {
      setHint({ index: h.index, letters: h.letters, removed: h.removed });
      setHintsLeft(h.hintsLeft);
    });
    s.on('fq:reveal', (r: FlagReveal) => {
      setReveal(r);
      const mine = r.results.find(x => x.userId === myIdRef.current);
      if (mine?.correctness === 'full') { sfx.win(); haptic(30); }
      else if (mine?.correctness === 'half') sfx.draw();
      else { sfx.lose(); haptic([20, 40, 20]); }
    });
    s.on('fq:over', (o: FlagOver) => {
      setOver(o);
      setQuestion(null);
      setReveal(null);
      const mine = o.standings.find(x => x.userId === myIdRef.current);
      if (o.newRecord || (o.standings.length > 1 && mine?.placement === 1)) crowdFx.gameWin();
      else sfx.gameWin();
    });
    s.on('chat:message', (m: ChatMessage) => {
      setChat(prev => [...prev.slice(-29), m]);
      const big = isBigEmoji(m);
      setBubbles(prev => ({ ...prev, [m.userId]: { id: m.id, text: m.text, emote: big } }));
      setTimeout(() => setBubbles(prev => {
        if (prev[m.userId]?.id !== m.id) return prev;
        const next = { ...prev };
        delete next[m.userId];
        return next;
      }), big ? EMOTE_BUBBLE_MS : BUBBLE_MS);
      if (m.userId !== myIdRef.current) {
        sfx.chat();
        if (!chatOpenRef.current && !m.emote) setUnread(n => n + 1);
      }
    });
    // Socketin luonti on ulkoisen järjestelmän tila; tallennetaan, jotta käsittelijät voivat lähettää viestejä
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);
    return () => {
      s.emit('fq:leave');
      s.disconnect();
    };
  }, [token, roomCode, logout]);

  // Pelimusiikki kysymysten ajan, rauhallisempi aulassa ja lopussa
  const phase = room?.phase;
  useEffect(() => {
    setMusic(phase === 'question' || phase === 'reveal' || phase === 'starting' ? 'game' : 'menu');
  }, [phase]);

  // Valmistautumisen lähtölaskenta
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startingAt) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [startingAt]);
  const countdown = startingAt ? Math.max(1, Math.ceil((startingAt - now) / 1000)) : null;

  const isHost = !!room && room.hostId === user?.id;
  const me = room?.players.find(p => p.userId === user?.id);
  const answeredCount = room?.players.filter(p => p.answered).length ?? 0;
  const connectedCount = room?.players.filter(p => p.connected).length ?? 0;
  const memberIds = useMemo(() => room?.players.map(p => p.userId) ?? [], [room?.players]);

  function changeSettings(partial: Partial<QuizSettings>) {
    if (!room) return;
    // Tason vaihto palauttaa palvelimella tason oletusvinkit ja -lisätavat
    socket?.emit('fq:settings', { settings: partial.level ? { level: partial.level } : partial });
  }

  function answer(value: string | number | boolean) {
    if (!question || myAnswer?.index === question.index) return;
    setMyAnswer({ index: question.index, value });
    socket?.emit('fq:answer', { index: question.index, value });
    sfx.pick();
  }

  function sendChat(message: { text?: string; emote?: string }) {
    socket?.emit('chat:send', message);
  }

  async function shareLink() {
    const url = `${window.location.origin}/lippu/${roomCode}`;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'BOWL', text: `Tule pelaamaan lippuvisaa! Huonekoodi ${roomCode}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* jako peruttiin */ }
  }

  function leave() {
    navigate('/lippu');
  }

  if (rejected) {
    return (
      <div className="room-page">
        <div className="room-center">
        <div className="card rejected">
          <div className="rejected-icon" aria-hidden="true">🚩</div>
          <h1>Huoneeseen {roomCode} ei pääse</h1>
          <p className="muted">{rejected}</p>
          <button className="btn btn-primary btn-block" onClick={leave}>Takaisin lippuvisaan</button>
        </div>
        </div>
      </div>
    );
  }

  const solo = !!room?.solo;
  const inGame = phase === 'question' || phase === 'reveal' || phase === 'starting';

  return (
    <div className="room-page flag-room">
      <header className="room-topbar">
        <button className="icon-btn" onClick={() => (inGame && !solo ? setConfirmLeave(true) : leave())} aria-label="Poistu">←</button>
        <div className="room-topbar-center">
          {(phase === 'question' && question) || (phase === 'reveal' && reveal) ? (
            <>
              <span className="topbar-round">Lippu {((question?.index ?? reveal?.index ?? 0) + 1)}/{question?.total ?? room?.settings.count}</span>
              <span className="eyebrow">{room ? LEVEL_BY_VALUE[room.settings.level].label : ''} · {me?.score ?? 0} p</span>
            </>
          ) : (
            <span className="eyebrow">{solo ? 'Lippuvisa · yksinpeli' : 'Lippuvisa'}</span>
          )}
        </div>
        <div className="room-topbar-right">
          {!solo && (
            <button className="icon-btn chat-btn" onClick={() => { setChatOpen(true); setUnread(0); }} aria-label={unread ? `Chat ja emotet, ${unread} uutta viestiä` : 'Chat ja emotet'}>
              😀
              {unread > 0 && <span className="unread">{unread > 9 ? '9+' : unread}</span>}
            </button>
          )}
          {solo && <span style={{ width: 40 }} />}
        </div>
      </header>

      {!room ? (
        <p className="muted center-text">Yhdistetään…</p>
      ) : (
        <main className="flag-main">
          {phase === 'lobby' && (
            <motion.div className="flag-lobby" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {!solo && (
                <>
                  <section className="code-block">
                    <div>
                      <p className="eyebrow">Huonekoodi</p>
                      <div className="code-big" aria-label={`Huonekoodi ${room.roomCode.split('').join(' ')}`}>
                        {room.roomCode.split('').map((c, i) => <span key={i}>{c}</span>)}
                      </div>
                    </div>
                    <div className="invite-buttons">
                      <button className="btn btn-primary btn-sm share-btn" onClick={() => setInviteOpen(true)}>👥 Kutsu kavereita</button>
                      <button className="btn btn-secondary btn-sm share-btn" onClick={shareLink}>{copied ? '✓ Kopioitu' : 'Jaa linkki'}</button>
                    </div>
                  </section>
                  <section className="card">
                    <div className="section-head"><h2>Pelaajat</h2><span className="faint">{room.players.length}/8</span></div>
                    <FlagPlayerChips players={room.players} myUserId={user?.id} bubbles={bubbles} showScore={false} showAnswered={false} />
                  </section>
                </>
              )}
              <FlagSettingsPanel settings={room.settings} editable={isHost} onChange={changeSettings} />
              <div className="flag-start">
                {isHost ? (
                  <button className="btn btn-primary btn-block btn-lg" onClick={() => socket?.emit('fq:start', {})}>
                    {solo ? 'Aloita' : `Aloita peli (${connectedCount} ${connectedCount === 1 ? 'pelaaja' : 'pelaajaa'})`}
                  </button>
                ) : (
                  <p className="faint waiting-host">Odotetaan, että host aloittaa pelin…</p>
                )}
              </div>
            </motion.div>
          )}

          {phase === 'starting' && (
            <div className="flag-countdown">
              <AnimatePresence mode="popLayout">
                <motion.span key={countdown} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }}>
                  {countdown}
                </motion.span>
              </AnimatePresence>
              <p className="muted">{LEVEL_BY_VALUE[room.settings.level].emoji} {LEVEL_BY_VALUE[room.settings.level].label} · {room.settings.count} lippua</p>
            </div>
          )}

          {phase === 'question' && question && (
            <>
              <FlagQuestionView
                question={question}
                answered={myAnswer?.index === question.index}
                myAnswer={myAnswer?.index === question.index ? myAnswer.value : null}
                hint={hint}
                hintsLeft={hintsLeft}
                onAnswer={answer}
                onHint={(type) => socket?.emit('fq:hint', { index: question.index, type })}
              />
              {!solo && (
                <div className="flag-status">
                  <FlagPlayerChips players={room.players} myUserId={user?.id} bubbles={bubbles} showScore showAnswered />
                  <p className="faint">{answeredCount}/{connectedCount} vastannut</p>
                </div>
              )}
            </>
          )}

          {phase === 'reveal' && reveal && (
            <>
              <FlagRevealView reveal={reveal} myUserId={user?.id} players={room.players} />
              {!solo && <FlagPlayerChips players={room.players} myUserId={user?.id} bubbles={bubbles} showScore showAnswered={false} />}
            </>
          )}

          {phase === 'over' && over && (
            <FlagGameOverView
              over={over}
              myUserId={user?.id}
              isHost={isHost}
              solo={solo}
              onReplay={() => socket?.emit('fq:start', {})}
              onSettings={() => socket?.emit('fq:toLobby')}
              onExit={leave}
            />
          )}
        </main>
      )}

      <InviteFriendsSheet open={inviteOpen} onClose={() => setInviteOpen(false)} roomCode={roomCode ?? ''} memberIds={memberIds} />
      <ChatSheet open={chatOpen} messages={chat} myUserId={user?.id} onSend={sendChat} onClose={() => { setChatOpen(false); setUnread(0); }} />
      <Modal open={confirmLeave} label="Poistu pelistä" onBackdrop={() => setConfirmLeave(false)}>
        <h2 className="sheet-title">Poistutaanko pelistä?</h2>
        <p className="sheet-sub">Muut jatkavat ilman sinua. Pisteesi jäävät tulokseen, ja voit palata huoneeseen samalla koodilla.</p>
        <div className="sheet-actions">
          <button className="btn btn-danger btn-block" onClick={leave}>Poistu</button>
          <button className="btn btn-ghost btn-block" onClick={() => setConfirmLeave(false)}>Jatka peliä</button>
        </div>
      </Modal>
    </div>
  );
}
