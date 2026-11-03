import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { SERVER_URL } from '../config';

export function useSocket(token: string | null) {
  const [connected, setConnected] = useState(false);

  // Socket luodaan ilman yhteyttä; yhdistäminen ja katkaisu tehdään efektissä
  const socket = useMemo(
    () => (token ? io(SERVER_URL || undefined, { auth: { token }, autoConnect: false }) : null),
    [token]
  );

  useEffect(() => {
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.connect();

    return () => {
      socket.disconnect();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return { socket, connected };
}
