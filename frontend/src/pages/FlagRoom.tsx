import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { SERVER_URL } from '../config';
import { useAuth } from '../context/AuthContext';
import { createFlagRoom } from '../api/flags';
import ChatSheet from '../components/ChatSheet';
import PauseMenu from '../components/PauseMenu';
import AudioSettingsSheet from '../components/AudioSettings';
import InviteFriendsSheet from '../components/InviteFriendsSheet';
import type { BubbleData } from '../components/ChatBubble';
import {
  FlagGameOverView, FlagPlayerChips, FlagQuestionView, FlagRevealView, FlagRules, FlagSettingsPanel,
  type AnswerMark, type Correctness, type FlagOver, type FlagPlayer, type FlagQuestion, type FlagReveal, type HintState,
} from '../components/FlagViews';
import { BUBBLE_MS, EMOTE_BUBBLE_MS, isBigEmoji, type ChatMessage } from '../constants/chat';
import { LEVEL_BY_VALUE, type QuizSettings } from '../constants/flags';
import { sfx, crowdFx, flagFx } from '../constants/sound';
import { setMusic } from '../constants/music';
import { setMusicMuffled } from '../constants/audioEngine';
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
  paused: { byName: string; ready: number[]; total: number } | null;
  practice: number | null;
}

// Yksinpelin asetukset muistetaan seuraavaan kertaan
const SOLO_SETTINGS_KEY = 'bowl-flag-solo-settings';

function loadSoloSettings(): Partial<QuizSettings> | null {
  try { return JSON.parse(localStorage.getItem(SOLO_SETTINGS_KEY) ?? 'null'); } catch { return null; }
}

function saveSoloSettings(settings: QuizSettings) {
  try { localStorage.setItem(SOLO_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* yksityinen selaus */ }
}

// Lippuvisan huone: aula ja asetukset, kysymykset ja paljastukset, tauko ja lopputulos (yksin- ja moninpeli)
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
  const [streak, setStreak] = useState(0);
  // Vastausajat ajastimen merkkejä varten (nykyinen kysymys) ja omat tulokset edistymispalloihin
  const [answerTimes, setAnswerTimes] = useState<{ index: number; times: Record<number, number> }>({ index: -1, times: {} });
  const [myResults, setMyResults] = useState<Correctness[]>([]);
  const [startingAt, setStartingAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [rejected, setRejected] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [bubbles, setBubbles] = useState<Record<number, BubbleData>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatOpenRef = useRef(false);
  const myIdRef = useRef<number | undefined>(user?.id);
  // Huonekohtaiset kertatoimet: sama sivu voi vaihtaa huonetta (esim. harjoitukseen), joten muistetaan koodi
  const soloSettingsApplied = useRef<string | null>(null);
  const practiceStarted = useRef<string | null>(null);

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
      setStreak(0);
      setMyResults([]);
      setNow(Date.now());
      setStartingAt(Date.now() + inMs);
    });
    s.on('fq:question', (q: Omit<FlagQuestion, 'receivedAt'>) => {
      setStartingAt(null);
      setReveal(null);
      setQuestion({ ...q, receivedAt: Date.now() });
      setMyAnswer(null);
      setAnswerTimes({ index: q.index, times: {} });
      flagFx.whoosh();
    });
    // Tauon jälkeen kysymyksen aika jatkuu siitä, mihin se jäi
    s.on('fq:resumed', ({ question: q }: { question: Omit<FlagQuestion, 'receivedAt'> | null }) => {
      if (q) setQuestion({ ...q, receivedAt: Date.now() });
    });
    s.on('fq:answered', ({ userId, elapsedMs }: { userId: number; elapsedMs: number }) => {
      setRoom(prev => prev && { ...prev, players: prev.players.map(p => (p.userId === userId ? { ...p, answered: true } : p)) });
      setAnswerTimes(prev => ({ ...prev, times: { ...prev.times, [userId]: elapsedMs } }));
    });
    s.on('fq:hint', (h: HintState & { hintsLeft: number }) => {
      setHint({ index: h.index, letters: h.letters, removed: h.removed });
      setHintsLeft(h.hintsLeft);
    });
    s.on('fq:reveal', (r: FlagReveal) => {
      setReveal(r);
      const mine = r.results.find(x => x.userId === myIdRef.current);
      setStreak(mine?.streak ?? 0);
      setMyResults(prev => {
        const next = [...prev];
        next[r.index] = mine?.correctness ?? 'none';
        return next;
      });
      if (mine?.correctness === 'full') { flagFx.correct(mine.streak); haptic(30); }
      else if (mine?.correctness === 'half') flagFx.half();
      else { flagFx.wrong(); haptic([20, 40, 20]); }
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

  const phase = room?.phase;
  const paused = !!room?.paused;
  const isHost = !!room && room.hostId === user?.id;
  const solo = !!room?.solo;

  // Pelimusiikki kysymysten ajan, rauhallisempi aulassa ja lopussa; tauolla vaimennettuna
  useEffect(() => {
    setMusic(phase === 'question' || phase === 'reveal' || phase === 'starting' ? 'game' : 'menu');
  }, [phase]);
  useEffect(() => {
    setMusicMuffled(paused);
    return () => setMusicMuffled(false);
  }, [paused]);

  // Yksinpeli: edellisen kerran asetukset käyttöön; harjoitus alkaa heti
  useEffect(() => {
    if (!room || !socket || !isHost || !solo || room.phase !== 'lobby') return;
    if (room.practice) {
      if (practiceStarted.current !== room.roomCode) {
        practiceStarted.current = room.roomCode;
        socket.emit('fq:start', {});
      }
      return;
    }
    if (soloSettingsApplied.current === room.roomCode) return;
    soloSettingsApplied.current = room.roomCode;
    const saved = loadSoloSettings();
    if (saved) socket.emit('fq:settings', { settings: saved });
  }, [room, socket, isHost, solo]);

  // Valmistautumisen lähtölaskenta
  useEffect(() => {
    if (!startingAt) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [startingAt]);
  const countdown = startingAt ? Math.max(1, Math.ceil((startingAt - now) / 1000)) : null;
  const lastCountdown = useRef<number | null>(null);
  useEffect(() => {
    if (countdown === null || countdown === lastCountdown.current) return;
    lastCountdown.current = countdown;
    flagFx.countdown(countdown === 1);
  }, [countdown]);

  const me = room?.players.find(p => p.userId === user?.id);
  const answeredCount = room?.players.filter(p => p.answered).length ?? 0;
  const connectedCount = room?.players.filter(p => p.connected).length ?? 0;
  const memberIds = useMemo(() => room?.players.map(p => p.userId) ?? [], [room?.players]);
  // Ajastimeen merkittävät vastaukset: kuka vastasi ja milloin (vain nykyinen kysymys)
  const marks: AnswerMark[] = useMemo(() => {
    if (!room || !question || answerTimes.index !== question.index) return [];
    return Object.entries(answerTimes.times).flatMap(([id, elapsedMs]) => {
      const player = room.players.find(p => p.userId === Number(id));
      return player ? [{ player, elapsedMs }] : [];
    });
  }, [room, question, answerTimes]);
  const iAmReady = !!room?.paused && !!user && room.paused.ready.includes(user.id);
  const lastMessage = chat.length ? chat[chat.length - 1]! : null;

  function changeSettings(partial: Partial<QuizSettings>) {
    // Tason vaihto palauttaa palvelimella tason oletusvinkit ja -lisätavat
    socket?.emit('fq:settings', { settings: partial.level ? { level: partial.level } : partial });
  }

  function start() {
    if (solo && room && !room.practice) saveSoloSettings(room.settings);
    socket?.emit('fq:start', {});
  }

  function answer(value: string | number | boolean) {
    if (!question || myAnswer?.index === question.index || paused) return;
    setMyAnswer({ index: question.index, value });
    socket?.emit('fq:answer', { index: question.index, value });
    flagFx.lock();
  }

  function sendChat(message: { text?: string; emote?: string }) {
    socket?.emit('chat:send', message);
  }

  async function practice(codes: string[]) {
    if (!token) return;
    try {
      const code = await createFlagRoom(token, { solo: true, practice: codes });
      navigate(`/lippu/${code}`);
    } catch { /* yhteysvirhe: pysytään tulossivulla */ }
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

  const inGame = phase === 'question' || phase === 'reveal' || phase === 'starting';
  const shownIndex = question?.index ?? reveal?.index ?? 0;

  return (
    <div className="room-page flag-room">
      <header className="room-topbar">
        {inGame ? (
          <button className="icon-btn" onClick={() => socket?.emit('fq:pause')} aria-label="Tauko" title="Tauko">❙❙</button>
        ) : (
          <button className="icon-btn" onClick={leave} aria-label="Poistu">←</button>
        )}
        <div className="room-topbar-center">
          {(phase === 'question' && question) || (phase === 'reveal' && reveal) ? (
            <>
              <span className="topbar-score">
                <motion.b key={me?.score ?? 0} initial={{ scale: 1.35, color: 'var(--accent-text)' }} animate={{ scale: 1, color: 'var(--text)' }} transition={{ duration: 0.45 }}>
                  {(me?.score ?? 0).toLocaleString('fi-FI')}
                </motion.b>
                <small>p</small>
                {streak >= 2 && <motion.span key={streak} className="topbar-streak" initial={{ scale: 0 }} animate={{ scale: 1 }}>🔥{streak}</motion.span>}
              </span>
              <span className="progress-dots" aria-label={`Lippu ${shownIndex + 1}/${question?.total ?? room?.settings.count}`}>
                {Array.from({ length: question?.total ?? room?.settings.count ?? 0 }, (_, i) => (
                  <i key={i} className={`${myResults[i] ?? ''} ${i === shownIndex ? 'current' : ''}`} />
                ))}
              </span>
            </>
          ) : (
            <span className="eyebrow">{room?.practice ? 'Lippuvisa · harjoitus' : solo ? 'Lippuvisa · yksinpeli' : 'Lippuvisa'}</span>
          )}
        </div>
        <div className="room-topbar-right">
          {!solo ? (
            <button className="icon-btn chat-btn" onClick={() => { setChatOpen(true); setUnread(0); }} aria-label={unread ? `Chat ja emotet, ${unread} uutta viestiä` : 'Chat ja emotet'}>
              😀
              {unread > 0 && <span className="unread">{unread > 9 ? '9+' : unread}</span>}
            </button>
          ) : (
            <button className="icon-btn" onClick={() => setAudioOpen(true)} aria-label="Äänet">🔊</button>
          )}
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
              {room.practice ? (
                <p className="muted center-text">Aloitetaan harjoitus…</p>
              ) : (
                <>
                  <FlagSettingsPanel settings={room.settings} editable={isHost} onChange={changeSettings} />
                  <div className="flag-start">
                    {isHost ? (
                      <button className="btn btn-primary btn-block btn-lg" onClick={start}>
                        {solo ? 'Aloita' : `Aloita peli (${connectedCount} ${connectedCount === 1 ? 'pelaaja' : 'pelaajaa'})`}
                      </button>
                    ) : (
                      <p className="faint waiting-host">Odotetaan, että host aloittaa pelin…</p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {phase === 'starting' && (
            <div className="flag-countdown">
              <AnimatePresence mode="popLayout">
                <motion.span key={countdown} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }}>
                  {countdown}
                </motion.span>
              </AnimatePresence>
              <p className="muted">
                {room.practice ? `📚 Harjoitus · ${room.practice} lippua` : `${LEVEL_BY_VALUE[room.settings.level].emoji} ${LEVEL_BY_VALUE[room.settings.level].label} · ${room.settings.count} lippua`}
              </p>
            </div>
          )}

          {(phase === 'question' || phase === 'reveal') && question && (
            <>
              <FlagQuestionView
                key={question.index}
                question={question}
                reveal={phase === 'reveal' ? reveal : null}
                myUserId={user?.id}
                players={room.players}
                marks={marks}
                answered={myAnswer?.index === question.index}
                myAnswer={myAnswer?.index === question.index ? myAnswer.value : null}
                hint={hint}
                hintsLeft={hintsLeft}
                paused={paused}
                onAnswer={answer}
                onHint={(type) => socket?.emit('fq:hint', { index: question.index, type })}
              />
              {!solo && (
                <div className="flag-status">
                  <FlagPlayerChips players={room.players} myUserId={user?.id} bubbles={bubbles} showScore showAnswered={phase === 'question'} />
                  {phase === 'question' && <p className="faint">{answeredCount}/{connectedCount} vastannut</p>}
                </div>
              )}
            </>
          )}

          {phase === 'reveal' && reveal && !question && (
            <FlagRevealView reveal={reveal} myUserId={user?.id} players={room.players} />
          )}

          {phase === 'over' && over && (
            <FlagGameOverView
              over={over}
              myUserId={user?.id}
              isHost={isHost}
              solo={solo}
              onReplay={() => socket?.emit('fq:start', {})}
              onSettings={() => socket?.emit('fq:toLobby')}
              onPractice={practice}
              onExit={leave}
            />
          )}
        </main>
      )}

      <PauseMenu
        visible={paused && !audioOpen && !chatOpen}
        iAmReady={iAmReady}
        readyCount={room?.paused?.ready.length ?? 0}
        readyTotal={room?.paused?.total ?? 1}
        pausedByName={solo ? null : room?.paused?.byName ?? null}
        rules={<FlagRules />}
        showChat={!solo}
        resumeNote="Aika on pysähtynyt kaikilta ja jatkuu siitä, mihin jäätiin."
        exitText={solo ? 'Peli päättyy, eikä tulosta tallenneta.' : 'Muut jatkavat ilman sinua. Pisteesi jäävät tulokseen, ja voit palata huoneeseen samalla koodilla.'}
        onToggleReady={() => socket?.emit('fq:ready', { ready: !iAmReady })}
        onOpenAudio={() => setAudioOpen(true)}
        onOpenChat={() => { setChatOpen(true); setUnread(0); }}
        unread={unread}
        lastMessage={lastMessage ? { name: lastMessage.userId === user?.id ? 'Sinä' : lastMessage.username, text: lastMessage.text } : null}
        onExit={leave}
      />

      <InviteFriendsSheet open={inviteOpen} onClose={() => setInviteOpen(false)} roomCode={roomCode ?? ''} memberIds={memberIds} />
      <AudioSettingsSheet open={audioOpen} onClose={() => setAudioOpen(false)} />
      <ChatSheet open={chatOpen} messages={chat} myUserId={user?.id} onSend={sendChat} onClose={() => { setChatOpen(false); setUnread(0); }} />
    </div>
  );
}
