// Firebase: anonymous auth + Firestore trip persistence. Every export is a
// no-op when the config is absent, so the app runs fine with zero Firebase
// setup and starts persisting the moment the env vars land.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, type Auth, type User } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp, collection, query, where, limit, getDocs, type Firestore } from "firebase/firestore";

export type TripUser = { uid: string; name: string | null; email: string | null; photo: string | null };

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(cfg.apiKey && cfg.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (firebaseEnabled) {
  app = getApps().length ? getApp() : initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
}

async function uid(): Promise<string | null> {
  if (!auth) return null;
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch {
      return null;
    }
  }
  return auth.currentUser?.uid ?? null;
}

function toTripUser(u: User | null): TripUser | null {
  if (!u || u.isAnonymous) return null;
  return { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL };
}

// Subscribe to real (non-anonymous) sign-in state. Returns an unsubscribe fn.
export function onAuthChange(cb: (u: TripUser | null) => void): () => void {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, (u) => cb(toTripUser(u)));
}

export async function signInWithGoogle(): Promise<TripUser | null> {
  if (!auth) return null;
  try {
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    return toTripUser(cred.user);
  } catch (e) {
    console.warn("sign-in failed", e);
    return null;
  }
}

export async function signOutUser() {
  if (auth) {
    try { await signOut(auth); } catch { /* no-op */ }
  }
}

// The signed-in user's saved trips, newest first. Empty without auth/config.
export type TripRow = { id: string; [key: string]: unknown };
export async function listTrips(userId: string): Promise<TripRow[]> {
  if (!db || !userId) return [];
  try {
    const snap = await getDocs(query(collection(db, "trips"), where("userId", "==", userId), limit(50)));
    const rows: TripRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
    rows.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    return rows;
  } catch (e) {
    console.warn("listTrips failed", e);
    return [];
  }
}
function toMillis(t: unknown): number {
  const ts = t as { toMillis?: () => number } | undefined;
  return ts?.toMillis ? ts.toMillis() : 0;
}

// Merge-write a trip doc. Safe to call repeatedly as the trip progresses
// (planned → committed → deposit_paid). Never throws into the UI.
export async function saveTrip(id: string, data: Record<string, unknown>) {
  if (!db) return;
  try {
    const userId = await uid();
    await setDoc(
      doc(db, "trips", id),
      { ...data, userId, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.warn("saveTrip failed", e);
  }
}

// Capture an interested lead (the conversion for the public-interest test).
// Returns true if it actually persisted, so the UI can fall back otherwise.
export async function saveLead(email: string, data: Record<string, unknown>): Promise<boolean> {
  if (!db) return false;
  try {
    const userId = await uid();
    await setDoc(
      doc(db, "leads", email.toLowerCase()),
      { ...data, email: email.toLowerCase(), userId, createdAt: serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn("saveLead failed", e);
    return false;
  }
}
