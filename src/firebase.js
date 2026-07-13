import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Config web do Firebase, vinda das variáveis de ambiente (VITE_*).
// Esses valores são públicos por natureza; a proteção real são as
// regras do Realtime Database.
// (env fica `{}` fora do Vite — ex.: ao rodar testes em Node — evitando erro.)
const env = import.meta.env || {};
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Está configurado se as chaves essenciais existem (não vazias).
export const configurado = Boolean(
  firebaseConfig.apiKey && firebaseConfig.databaseURL
);

let db = null;
let app = null;
if (configurado) {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
}

export { db, app };
