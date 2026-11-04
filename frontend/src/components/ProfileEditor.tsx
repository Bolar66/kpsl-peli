import { useRef, useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import type { Profile } from '../api/profile';

const EMOJIS = ['😎', '🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐯', '🤖', '👾', '🔥', '⚡', '🍕', '🎯', '👑', '🌵'];
const COLORS = ['#D4FF3A', '#7DD3FC', '#F9A8D4', '#FDBA74', '#A7F3D0', '#C4B5FD', '#FDE68A', '#FCA5A5'];
const IMAGE_SIZE = 160;
const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 400;
const MAX_BANNER_LENGTH = 390_000;
const BIO_MAX = 80;

interface ProfileEditorProps {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (changes: Partial<Pick<Profile, 'username' | 'avatarEmoji' | 'avatarColor' | 'avatarImage' | 'email' | 'bio' | 'bannerImage'>>) => Promise<void>;
}

// Pienentää valitun kuvan neliöksi, jotta se mahtuu tietokantaan ja latautuu nopeasti
async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  return canvas.toDataURL('image/jpeg', 0.82);
}

// Taustakuva rajataan keskeltä 3:1-muotoon. Laatua lasketaan tarvittaessa, jotta kuva mahtuu tallennusrajaan.
async function resizeBanner(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = BANNER_WIDTH / BANNER_HEIGHT;
  const srcW = Math.min(bitmap.width, bitmap.height * ratio);
  const srcH = srcW / ratio;
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_WIDTH;
  canvas.height = BANNER_HEIGHT;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - srcW) / 2, (bitmap.height - srcH) / 2, srcW, srcH, 0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  for (const quality of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_BANNER_LENGTH) return url;
  }
  throw new Error('liian suuri');
}

export default function ProfileEditor({ open, profile, onClose, onSave }: ProfileEditorProps) {
  const [username, setUsername] = useState(profile.username);
  const [emoji, setEmoji] = useState<string | null>(profile.avatarEmoji);
  const [color, setColor] = useState<string | null>(profile.avatarColor);
  const [image, setImage] = useState<string | null>(profile.avatarImage);
  const [email, setEmail] = useState(profile.email ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [banner, setBanner] = useState<string | null>(profile.bannerImage);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  // Lomake täytetään uudelleen joka kerta kun ikkuna avataan
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUsername(profile.username);
      setEmoji(profile.avatarEmoji);
      setColor(profile.avatarColor);
      setImage(profile.avatarImage);
      setEmail(profile.email ?? '');
      setBio(profile.bio ?? '');
      setBanner(profile.bannerImage);
      setError('');
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setImage(await resizeImage(file));
      setError('');
    } catch {
      setError('Kuvaa ei voitu lukea. Kokeile toista kuvaa.');
    }
  }

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setBanner(await resizeBanner(file));
      setError('');
    } catch {
      setError('Taustakuvaa ei voitu käyttää. Kokeile toista kuvaa.');
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave({ username: username.trim(), avatarEmoji: emoji, avatarColor: color, avatarImage: image, email: email.trim() || null, bio: bio.trim() || null, bannerImage: banner });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui');
    } finally {
      setSaving(false);
    }
  }

  const preview = { userId: profile.id, username: username || profile.username, avatarEmoji: emoji, avatarColor: color, avatarImage: image };

  return (
    <Modal open={open} label="Muokkaa profiilia" onBackdrop={onClose}>
      <h2 className="sheet-title">Muokkaa profiilia</h2>

      <div className="editor-banner">
        <div
          className={`profile-banner ${banner ? '' : 'empty'}`}
          style={banner ? { backgroundImage: `url(${banner})` } : undefined}
          aria-hidden="true"
        />
        <div className="editor-banner-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => bannerInput.current?.click()}>
            {banner ? 'Vaihda taustakuva' : 'Lisää taustakuva'}
          </button>
          {banner && <button className="btn btn-ghost btn-sm" onClick={() => setBanner(null)}>Poista</button>}
          <input ref={bannerInput} type="file" accept="image/*" hidden onChange={handleBannerFile} />
        </div>
      </div>

      <div className="editor-preview">
        <Avatar player={preview} size={88} />
        <div className="editor-photo-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()}>
            {image ? 'Vaihda kuva' : 'Lataa oma kuva'}
          </button>
          {image && <button className="btn btn-ghost btn-sm" onClick={() => setImage(null)}>Poista kuva</button>}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={handleFile} />
        </div>
      </div>

      <label className="field">
        <span className="field-label">Nimimerkki</span>
        <input className="input" maxLength={20} value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Bio <span className="faint">— näkyy kavereille ({bio.length}/{BIO_MAX})</span></span>
        <input className="input" maxLength={BIO_MAX} placeholder="Kivi ei petä koskaan 🪨" value={bio} onChange={(e) => setBio(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Sähköposti <span className="faint">— salasanan palautukseen, ei näy muille</span></span>
        <input className="input" type="email" autoComplete="email" placeholder="nimi@esimerkki.fi" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>

      <div className="field">
        <span className="field-label">Emoji {image && <span className="faint">— näkyy kun omaa kuvaa ei ole</span>}</span>
        <div className="emoji-grid">
          <button className={`emoji-opt ${emoji === null ? 'active' : ''}`} onClick={() => setEmoji(null)} aria-label="Alkukirjain">
            {(username || profile.username).charAt(0).toUpperCase()}
          </button>
          {EMOJIS.map(e => (
            <button key={e} className={`emoji-opt ${emoji === e ? 'active' : ''}`} onClick={() => setEmoji(e)} aria-label={e}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Taustaväri</span>
        <div className="color-row">
          {COLORS.map(c => (
            <button
              key={c}
              className={`color-opt ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Väri ${c}`}
            />
          ))}
        </div>
      </div>

      {error && <p className="alert alert-danger" role="alert">{error}</p>}

      <div className="sheet-actions">
        <button className="btn btn-primary btn-block" onClick={handleSave} disabled={saving}>
          {saving ? 'Tallennetaan…' : 'Tallenna'}
        </button>
        <button className="btn btn-ghost btn-block" onClick={onClose}>Peruuta</button>
      </div>
    </Modal>
  );
}
