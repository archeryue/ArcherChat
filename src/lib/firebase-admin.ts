import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

// Lazy initialization to avoid build-time errors
let app: App | null = null;
let firestoreInstance: Firestore | null = null;

function getFirebaseApp(): App {
  if (app) return app;

  if (!getApps().length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined;

    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } else {
    app = getApps()[0];
  }

  return app;
}

// Export Firestore instance with lazy initialization
export const db = new Proxy({} as Firestore, {
  get(_target, prop) {
    if (!firestoreInstance) {
      getFirebaseApp();
      firestoreInstance = getFirestore();
    }
    return (firestoreInstance as any)[prop];
  }
});

// Collection names
export const COLLECTIONS = {
  USERS: "users",
  CONVERSATIONS: "conversations",
  MESSAGES: "messages",
  WHITELIST: "whitelist",
  PROMPTS: "prompts",
} as const;
