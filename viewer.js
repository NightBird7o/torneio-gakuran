import { defaultState, normalizeState } from './tournament-core.js';
import { isConfigured, observeTournament, submitApplication } from './firebase-client.js';
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
  toast: document.getElementById('toast'),
  applicationForm: document.getElementById('applicationForm'),
  applicationName: document.getElementById('applicationName'),
  applicationRoblox: document.getElementById('applicationRoblox'),
  applicationAge: document.getElementById('applicationAge'),
  applicationNationality: document.getElementById('applicationNationality'),
  applicationHeight: document.getElementById('applicationHeight'),
  applicationStyle1: document.getElementById('applicationStyle1'),
  applicationStyle2: document.getElementById('applicationStyle2'),
  applicationSubmit: document.getElementById('applicationSubmit'),
  applicationMessage: document.getElementById('applicationMessage'),
  registrationBadge: document.getElementById('registrationBadge')
};

let state = defaultState();
let toastTimer = null;
let sendingApplication = false;

const renderer = createTournamentRenderer({
  getState: () => state,
  canEdit: () => false,
  elements: els
});

function showToast(message, type = 'normal') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show${type === 'error' ? ' error' : ''}`;
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3200);
}

function setConnection(status, type = 'normal') {
  els.connectionStatus.textContent = status;
  els.liveDot.className = `live-dot${type === 'online' ? ' online' : type === 'error' ? ' error' : ''}`;
}

function renderRegistration() {
  const open = state.registrationOpen !== false && isConfigured;
  els.registrationBadge.textContent = open ? '● Inscrições abertas' : 'Inscrições fechadas';
  els.registrationBadge.className = `registration-badge${open ? ' open' : ' closed'}`;
  els.applicationSubmit.disabled = !open || sendingApplication;
  els.applicationForm.querySelectorAll('input').forEach((input) => {
    input.disabled = !open || sendingApplication;
  });
  if (!open && !sendingApplication) {
    els.applicationMessage.textContent = 'O organizador fechou as candidaturas neste momento.';
  } else if (!els.applicationMessage.dataset.persist) {
    els.applicationMessage.textContent = '';
  }
}

function render() {
  renderer.render();
  els.lastUpdate.textContent = formatTimestamp(state.updatedAt);
  renderRegistration();
}

els.printBtn.addEventListener('click', () => window.print());

els.applicationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.registrationOpen === false) {
    showToast('As inscrições estão fechadas.', 'error');
    return;
  }

  const style1 = els.applicationStyle1.value.trim();
  const style2 = els.applicationStyle2.value.trim();
  if (!style1) {
    showToast('Informe pelo menos um estilo de luta.', 'error');
    return;
  }
  if (style2 && style2.toLowerCase() === style1.toLowerCase()) {
    showToast('O segundo estilo precisa ser diferente ou ficar vazio.', 'error');
    return;
  }

  const application = {
    fullName: els.applicationName.value.trim(),
    roblox: els.applicationRoblox.value.trim(),
    age: els.applicationAge.value.trim(),
    nationality: els.applicationNationality.value.trim(),
    height: Number(els.applicationHeight.value).toFixed(2),
    styles: [style1, style2].filter(Boolean)
  };

  try {
    sendingApplication = true;
    els.applicationMessage.dataset.persist = 'true';
    els.applicationMessage.textContent = 'Enviando candidatura...';
    renderRegistration();
    await submitApplication(application);
    els.applicationForm.reset();
    els.applicationMessage.textContent = 'Candidatura enviada! Aguarde a aprovação do organizador.';
    showToast('Sua candidatura foi enviada com sucesso.');
  } catch (error) {
    els.applicationMessage.textContent = 'Não foi possível enviar. Verifique se as inscrições estão abertas e tente novamente.';
    showToast(error?.message || 'Erro ao enviar candidatura.', 'error');
  } finally {
    sendingApplication = false;
    renderRegistration();
    setTimeout(() => {
      delete els.applicationMessage.dataset.persist;
    }, 5000);
  }
});

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
