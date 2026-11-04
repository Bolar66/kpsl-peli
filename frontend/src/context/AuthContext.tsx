import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface User {
  id: number;
  username: string;
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  avatarImage?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Kirjautuminen tallennetaan sekä välilehtikohtaisesti (sessionStorage) että pysyvästi (localStorage).
// Välilehden oma kirjautuminen voittaa, joten eri välilehdillä voi olla eri käyttäjä
// (kätevä testatessa). Uusi välilehti aloittaa viimeksi kirjautuneena käyttäjänä.
function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  try {
    for (const storage of [sessionStorage, localStorage]) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  } catch {
    // Selaimen tallennustila ei käytössä (esim. yksityinen tila) — kirjautuminen säilyy vain muistissa
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStored('token'));
  const [user, setUser] = useState<User | null>(() => {
    const stored = readStored('user');
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  function setAuth(newToken: string, newUser: User) {
    setToken(newToken);
    setUser(newUser);
    writeStored('token', newToken);
    writeStored('user', JSON.stringify(newUser));
  }

  // useCallback: logout on efektien riippuvuutena (Room), joten sen pitää pysyä samana renderöintien välillä
  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    writeStored('token', null);
    writeStored('user', null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook kuuluu samaan tiedostoon kuin Provider
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth pitää käyttää AuthProviderin sisällä');
  return context;
}
