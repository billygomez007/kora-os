export interface KoraAuthUser {
  id: string;
  email: string | null;
  displayName: string;
}

export interface KoraSession {
  user: KoraAuthUser;
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  refreshToken: string;
  session: {
    id: string;
    expiresAt: string;
  };
}

const SESSION_KEY = "kora.auth.session";

export function saveKoraSession(session: KoraSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getKoraSession(): KoraSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as KoraSession;
  } catch {
    return null;
  }
}

export function clearKoraSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
