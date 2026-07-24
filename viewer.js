import { defaultState, normalizeState } from './tournament-core.js';
import { isConfigured, observeTournament } from './firebase-client.js';
import { createTournamentRenderer, formatTimestamp } from './tournament-ui.js';

const els = {
  qualifierPanel: document.getElementById('qualifierPanel'),
  qualifierRounds: document.getElementById('qualifierRounds'),
  bracketEmpty: document.getElementById('bracketEmpty'),
  bracketStage: document.getElementById('bracketStage'),
  bracketScroll: document.getElementById('bracketScroll'),
  bracketSummary: document.getElementById('bracketSummary'),
  firstPlace: document.getElementById('firstPlace'),
  secondPlace: document.getElementById('secondPlace'),
  thirdPlace: document.getElementById('thirdPlace'),
  printBtn: document.getElementById('printBtn'),
  liveDot: document.getElementById('liveDot'),
  connectionStatus: document.getElementById('connectionStatus'),
  lastUpdate: document.getElementById('lastUpdate'),
  setupWarning: document.getElementById('setupWarning'),
  toast: document.getElementById('toast')
};

let state = defaultState();
let toastTimer = null;

const renderer = createTournamentRenderer({
  getState: () => state,
  canEdit: () => false,
  elements: els
});

function showToast(message, type = 'normal') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show${type === 'error' ? ' error' : ''}`;
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3000);
}

function setConnection(status, type = 'normal') {
  els.connectionStatus.textContent = status;
  els.liveDot.className = `live-dot${type === 'online' ? ' online' : type === 'error' ? ' error' : ''}`;
}

function render() {
  renderer.render();
  els.lastUpdate.textContent = formatTimestamp(state.updatedAt);
}

els.printBtn.addEventListener('click', () => window.print());

if (isConfigured) {
  observeTournament(
    (cloudState) => {
      state = normalizeState(cloudState);
      setConnection('Placar conectado em tempo real', 'online');
      render();
    },
    (error) => {
      setConnection('Não foi possível carregar o placar', 'error');
      showToast(error?.message || 'Erro ao conectar ao placar.', 'error');
    }
  );
} else {
  els.setupWarning.classList.remove('hidden');
  setConnection('Placar ainda não configurado', 'error');
  render();
}
