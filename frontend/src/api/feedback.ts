import { API_URL } from '../config';

export type FeedbackCategory = 'bug' | 'idea' | 'other';

export async function sendFeedback(token: string, category: FeedbackCategory, message: string): Promise<void> {
  const res = await fetch(`${API_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ category, message, page: window.location.pathname }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Palautteen lähetys epäonnistui');
}
