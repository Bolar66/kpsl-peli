import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SERVER_URL } from '../config';
import { useAuth } from './AuthContext';
import { getFriends, type FriendUser } from '../api/friends';
import Avatar from '../components/Avatar';
import { sfx } from '../constants/sound';
import { syncPushSubscription } from '../constants/push';

type Toast =
  | { id: number; kind: 'invite'; from: FriendUser; roomCode: string; game: string }
  | { id: number; kind: 'request'; from: FriendUser }
  | { id: number; kind: 'accepted'; from: FriendUser };

interface PresenceContextType {
  // Saapuneiden kaveripyyntöjen määrä yläpalkin merkkiin
  incomingCount: number;
  // Kasvaa aina kun kaverilista on voinut muuttua; Kaverit-sivu hakee silloin listan uudelleen
  version: number;
  refresh: () => void;
}

const PresenceContext = createContext<PresenceContextType>({ incomingCount: 0, version: 0, refresh: () => {} });
const TOAST_MS = { invite: 20_000, request: 8_000, accepted: 6_000 };
let nextToastId = 1;

// Sovelluksen laajuinen yhteys: kertoo palvelimelle, että olet paikalla, ja tuo pelikutsut ja
// kaveripyynnöt näkyviin missä näkymässä tahansa
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();
  const [incomingCount, setIncomingCount] = useState(0);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  const refresh = useCallback(() => setVersion(v => v + 1), []);

  // Pyyntöjen määrä haetaan aina kun lista on voinut muuttua
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getFriends(token)
      .then(lists => { if (!cancelled) setIncomingCount(lists.incoming.length); })
      .catch(() => { /* vierastili tai verkkovirhe: merkki jää näyttämättä */ });
    return () => { cancelled = true; };
  }, [token, version]);

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextToastId++;
    setToasts(prev => [...prev.filter(t => !(t.kind === toast.kind && t.from.id === toast.from.id)), { ...toast, id } as Toast]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_MS[toast.kind]);
    sfx.chat();
  }, []);

  // Laitteen ilmoitustilaus seuraa kirjautunutta käyttäjää
  useEffect(() => {
    if (token) syncPushSubscription(token).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = io(`${SERVER_URL}/presence`, { auth: { token } });
    socket.on('friends:request', ({ from }: { from: FriendUser }) => { refresh(); pushToast({ kind: 'request', from }); });
    socket.on('friends:accepted', ({ by }: { by: FriendUser }) => { refresh(); pushToast({ kind: 'accepted', from: by }); });
    socket.on('friends:changed', refresh);
    socket.on('invite', (data: { from: FriendUser; roomCode: string; game: string }) => pushToast({ kind: 'invite', ...data }));
    socket.on('connect_error', (err: Error) => { if (err.message === 'Virheellinen token') logout(); });
    return () => { socket.disconnect(); };
  }, [token, refresh, pushToast, logout]);

  function dismiss(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  function open(toast: Toast) {
    dismiss(toast.id);
    navigate(toast.kind === 'invite' ? `/room/${toast.roomCode}` : '/kaverit');
  }

  // Kutsua samaan huoneeseen, jossa jo ollaan, ei näytetä
  const visible = toasts.filter(t => !(t.kind === 'invite' && location.pathname === `/room/${t.roomCode}`));

  return (
    <PresenceContext.Provider value={{ incomingCount: token ? incomingCount : 0, version, refresh }}>
      {children}
      <div className="toast-stack" aria-live="polite">
        <AnimatePresence>
          {visible.map(t => (
            <motion.div
              key={t.id}
              className={`toast ${t.kind}`}
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              role="status"
            >
              <Avatar player={{ userId: t.from.id, ...t.from }} size={38} />
              <div className="toast-text">
                {t.kind === 'invite' && <><b>{t.from.username}</b> kutsuu sinut peliin<span>{t.game}</span></>}
                {t.kind === 'request' && <><b>{t.from.username}</b> haluaa kaveriksesi</>}
                {t.kind === 'accepted' && <><b>{t.from.username}</b> hyväksyi kaveripyyntösi</>}
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => open(t)}>
                {t.kind === 'invite' ? 'Liity' : 'Näytä'}
              </button>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Sulje ilmoitus">✕</button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </PresenceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook kuuluu samaan tiedostoon kuin Provider
export function usePresence() {
  return useContext(PresenceContext);
}
