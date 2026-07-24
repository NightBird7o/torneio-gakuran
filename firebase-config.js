// Cole aqui os dados mostrados em: Firebase Console > Configurações do projeto > Seus apps > SDK setup and configuration.
// O objeto firebaseConfig pode ficar público no GitHub. A proteção contra alterações é feita pelas regras do banco e pelo UID do administrador.
export const firebaseConfig = {
  apiKey: "COLE_SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "COLE_SEU_MESSAGING_SENDER_ID",
  appId: "COLE_SEU_APP_ID"
};

// Cole o UID da única conta autorizada a administrar o torneio.
// O mesmo UID deve ser colocado em database.rules.json antes de publicar as regras.
export const ADMIN_UID = "COLE_SEU_UID_AQUI";

// Caminho usado no Realtime Database.
export const DATA_PATH = "gakuran/current";
