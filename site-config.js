export const SITE_CONFIG = Object.freeze({
  gangName: '〚神聖〛ＤＩＶＩＮＡ・ＴＯＫＹＯ',
  shortName: 'DIVINA TOKYO',
  // Depois, troque pela URL pública do serviço do Amateru no Railway.
  // Ex.: https://amateru-divina-tokyo.up.railway.app
  apiBaseUrl: 'https://gakuran-discord-bot-production.up.railway.app',
  discordInviteUrl: '',
  tokenStorageKey: 'divinaTokyoSessionV5',
});

export function isApiConfigured() {
  return /^https:\/\//i.test(SITE_CONFIG.apiBaseUrl)
    && !SITE_CONFIG.apiBaseUrl.includes('COLE_A_URL_DA_API_AQUI');
}
