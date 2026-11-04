import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { CHAT_MAX_LENGTH, EMOTES, QUICK_PHRASES, isBigEmoji, type ChatMessage } from '../constants/chat';
import { playerColor } from '../constants/players';

interface ChatSheetProps {
  open: boolean;
  messages: ChatMessage[];
  myUserId: number | undefined;
  onSend: (message: { text?: string; emote?: string }) => void;
  onClose: () => void;
}

// Chat-ikkuna: viestihistoria, emotet, pikafraasit ja vapaa teksti
export default function ChatSheet({ open, messages, myUserId, onSend, onClose }: ChatSheetProps) {
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  // Uusin viesti näkyviin
  useEffect(() => {
    if (open) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [open, messages.length]);

  // Lähetys sulkee ikkunan, jotta kupla näkyy heti pöydässä
  function sendAndClose(message: { text?: string; emote?: string }) {
    onSend(message);
    onClose();
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    sendAndClose({ text: value });
    setText('');
  }

  return (
    <Modal open={open} label="Chat" onBackdrop={onClose}>
      <div className="chat-head">
        <h2 className="sheet-title">Chat</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Sulje chat">✕</button>
      </div>

      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.length === 0 ? (
          <p className="faint chat-empty">Ei vielä viestejä. Aloita vaikka emotella!</p>
        ) : messages.map(m => (
          <div key={m.id} className={`chat-line ${m.userId === myUserId ? 'mine' : ''}`}>
            <span className="chat-name" style={{ color: playerColor(m.userId) }}>
              {m.userId === myUserId ? 'Sinä' : m.username}
            </span>
            <span className={`chat-text ${isBigEmoji(m) ? 'emote' : ''}`}>{m.text}</span>
          </div>
        ))}
      </div>

      <div className="emote-grid" role="group" aria-label="Emotet">
        {EMOTES.map(e => (
          <button key={e} className="emote-btn" onClick={() => sendAndClose({ emote: e })} aria-label={`Lähetä ${e}`}>{e}</button>
        ))}
      </div>
      <div className="phrase-row">
        {QUICK_PHRASES.map(p => (
          <button key={p} className="phrase-btn" onClick={() => sendAndClose({ text: p })}>{p}</button>
        ))}
      </div>

      <form className="chat-form" onSubmit={send}>
        <input
          className="input"
          placeholder="Kirjoita viesti…"
          maxLength={CHAT_MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="send"
          aria-label="Viesti"
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>Lähetä</button>
      </form>
    </Modal>
  );
}
