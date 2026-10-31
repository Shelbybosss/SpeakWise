// Everything SpeakWise keeps lives in this browser's localStorage under these keys.
export const KEYS = { sessions: "sw", bank: "sb", recent: "sr", profile: "sp", resume: "sq", settings: "sx" };

const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export const sessions = () => (read(KEYS.sessions, { s: [] }).s || []);
export function saveSession(s) {
  const all = sessions(), i = all.findIndex(x => x.id && x.id === s.id);
  if (i >= 0) all[i] = s; else all.push(s);
  write(KEYS.sessions, { s: all.slice(-200) });
}
export const lastAttempt = (title, exceptId) => sessions().filter(x => x.t === title && x.id !== exceptId).pop() || null;

export const bank = () => read(KEYS.bank, []);
export function addToBank(t) {
  const b = bank();
  if (b.some(x => x[0] === t[0])) return false;
  b.push(t); write(KEYS.bank, b); return true;
}

export const recent = () => read(KEYS.recent, []);
export function pushRecent(key) { const r = recent(); r.push(key); write(KEYS.recent, r.slice(-60)); }
export function clearRecent(cat) { write(KEYS.recent, recent().filter(k => !k.startsWith(cat + "|"))); }

export const profile = () => read(KEYS.profile, {});
export const setProfile = p => write(KEYS.profile, p);

export const resumeTopics = () => read(KEYS.resume, []);
export const setResumeTopics = t => t.length ? write(KEYS.resume, t) : localStorage.removeItem(KEYS.resume);

export const settings = () => read(KEYS.settings, {});
export const saveSettings = patch => write(KEYS.settings, { ...settings(), ...patch });

export function wipe() { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }
