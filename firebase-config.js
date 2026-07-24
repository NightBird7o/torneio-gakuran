// Configuração pública do aplicativo Web no Firebase.
// A segurança das alterações é controlada pelo Firebase Authentication
// e pelas regras do Realtime Database, não pelo sigilo deste arquivo.

export const firebaseConfig = {
  apiKey: "AIzaSyDfMZZdJN0Jlga1Mq-NAsI_nUGHXSzsOrU",
  authDomain: "torneio-gakuran.firebaseapp.com",
  databaseURL: "https://torneio-gakuran-default-rtdb.firebaseio.com",
  projectId: "torneio-gakuran",
  storageBucket: "torneio-gakuran.firebasestorage.app",
  messagingSenderId: "248970334726",
  appId: "1:248970334726:web:d3d89c0b3ec33101966987"
};

// Única conta autorizada a administrar o torneio.
export const ADMIN_UID = "qK3r2XAprGPgHPDWgmkap2QHrfj2";

// Caminho compartilhado pelo painel administrativo e pelo placar público.
export const DATA_PATH = "gakuran/current";
