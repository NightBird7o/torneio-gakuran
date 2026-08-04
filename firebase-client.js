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
  push,
  ref,
  remove,
  serverTimestamp,
  set
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js';
import { firebaseConfig, ADMIN_UID, DATA_PATH } from './firebase-config.js';

export const isConfigured = !Object.values(firebaseConfig).some((value) =>
  String(value).includes('COLE_') || String(value).includes('SEU_PROJETO')
) && !ADMIN_UID.includes('COLE_');

export const APPLICATIONS_PATH = DATA_PATH.replace(/\/current\/?$/, '/applications');

let app = null;
let auth = null;
let db = null;
let tournamentRef = null;
let applicationsRef = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  tournamentRef = ref(db, DATA_PATH);
  applicationsRef = ref(db, APPLICATIONS_PATH);
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

export function observeApplications(onData, onError) {
  if (!applicationsRef) {
    onError?.(new Error('Firebase ainda não foi configurado.'));
    return () => {};
  }
  return onValue(
    applicationsRef,
    (snapshot) => {
      const value = snapshot.exists() ? snapshot.val() : {};
      const applications = Object.entries(value || {}).map(([id, application]) => ({ id, ...application }));
      applications.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      onData(applications);
    },
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
    registrationOpen: state.registrationOpen !== false,
    updatedAt: serverTimestamp()
  });
}

export async function submitApplication(application) {
  if (!applicationsRef) throw new Error('Firebase ainda não foi configurado.');
  const newApplicationRef = push(applicationsRef);
  await set(newApplicationRef, {
    fullName: String(application.fullName || '').trim(),
    roblox: String(application.roblox || '').trim(),
    age: String(application.age || '').trim(),
    nationality: String(application.nationality || '').trim(),
    height: String(application.height || '').trim(),
    styles: Array.isArray(application.styles) ? application.styles.slice(0, 2) : [],
    createdAt: serverTimestamp()
  });
  return newApplicationRef.key;
}

export async function deleteApplication(applicationId) {
  if (!db) throw new Error('Firebase ainda não foi configurado.');
  await remove(ref(db, `${APPLICATIONS_PATH}/${applicationId}`));
}

export function isAuthorizedUser(user) {
  return Boolean(user && user.uid === ADMIN_UID);
}

export { ADMIN_UID };
