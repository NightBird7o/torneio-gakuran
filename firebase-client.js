import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getDatabase,
  onValue,
  ref,
  serverTimestamp,
  set
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { firebaseConfig, ADMIN_UID, DATA_PATH } from './firebase-config.js';

export const isConfigured = !Object.values(firebaseConfig).some((value) =>
  String(value).includes('COLE_') || String(value).includes('SEU_PROJETO')
) && !ADMIN_UID.includes('COLE_');

let app = null;
let auth = null;
let db = null;
let tournamentRef = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  tournamentRef = ref(db, DATA_PATH);
}

export function observeTournament(onData, onError) {
  if (!tournamentRef) {
    onError?.(new Error('Firebase ainda não foi configurado.'));
    return () => {};
  }
  return onValue(
    tournamentRef,
    (snapshot) => onData(snapshot.exists() ? snapshot.val() : null),
    (error) => onError?.(error)
  );
}

export function observeAuth(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function login(email, password) {
  if (!auth) throw new Error('Firebase ainda não foi configurado.');
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  if (!auth) return;
  await firebaseSignOut(auth);
}

export async function saveCloudState(state) {
  if (!tournamentRef) throw new Error('Firebase ainda não foi configurado.');
  await set(tournamentRef, {
    players: state.players || [],
    tournament: state.tournament || null,
    updatedAt: serverTimestamp()
  });
}

export function isAuthorizedUser(user) {
  return Boolean(user && user.uid === ADMIN_UID);
}

export { ADMIN_UID };
