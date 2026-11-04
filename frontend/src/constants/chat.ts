// Chatin ja emotejen yhteiset määritykset (samat emotet hyväksytään palvelimella)

export interface ChatMessage {
  id: number;
  userId: number;
  username: string;
  text: string;
  emote: boolean;
  at: number;
}

export const EMOTES = ['😂', '🔥', '👏', '😎', '😤', '🤯', '💀', '🙏', '😭', '🫡', '👀', '🍿'];

export const QUICK_PHRASES = ['GG', 'Hyvä!', 'Revanssi!', 'Ei voi olla totta', 'Arvasin', 'Onnea!'];

export const CHAT_MAX_LENGTH = 120;

// Pelkistä emojeista (enintään kolme) koostuva viesti näytetään isona emotena
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u;
export function isBigEmoji(message: { text: string; emote: boolean }): boolean {
  if (message.emote) return true;
  if (!EMOJI_ONLY.test(message.text)) return false;
  const graphemes = [...new Intl.Segmenter().segment(message.text.replace(/\s/g, ''))];
  return graphemes.length > 0 && graphemes.length <= 3;
}

// Kuinka kauan puhekupla näkyy (emote lyhyemmän aikaa)
export const BUBBLE_MS = 4200;
export const EMOTE_BUBBLE_MS = 2800;
