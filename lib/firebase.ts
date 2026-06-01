// Firebase: anonymous auth + Firestore trip persistence. Every export is a
// no-op when the config is absent, so the app runs fine with zero Firebase
// setup and starts persisting the moment the env vars land.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";

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
