// Pelihuoneiden chat: yhteiset määritykset ja viestien siivous (kivi-paperi-sakset ja lippuvisa)
export interface ChatMessage {
  id: number;
  userId: number;
  username: string;
  text: string;
  emote: boolean;
  at: number;
}
export const CHAT_HISTORY = 30;
export const CHAT_MAX_LENGTH = 120;
// Sallitut emotet (pikapalkki); muut emojit kulkevat tavallisina viesteinä
export const EMOTES = new Set(['😂', '🔥', '👏', '😎', '😤', '🤯', '💀', '🙏', '😭', '🫡', '👀', '🍿']);
let chatIdCounter = 1;
export function nextChatId() {
  return chatIdCounter++;
}

// Viestin siivous: ohjausmerkit ja näkymättömät suunnanvaihtomerkit pois, välilyönnit tiivistettynä
export function cleanChatText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    // Ohjausmerkit, n\u00e4kym\u00e4tt\u00f6m\u00e4t v\u00e4lit ja suunnanvaihtomerkit pois (yhdist\u00e4v\u00e4 \u200d s\u00e4ilyy emojeja varten)
    .replace(/[\u0000-\u001f\u007f\u200b\u200c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return Array.from(text).slice(0, CHAT_MAX_LENGTH).join('');
}
