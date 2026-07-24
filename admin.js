import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  buildTournament,
  chooseWinner,
  createId,
  defaultState,
  escapeHtml,
  findPlayer,
  normalizeState,
  playerLabel,
  resetResults
} from './tournament-core.js';
import {
  isConfigured,
  isAuthorizedUser,
  login,
  logout,
  observeAuth,
  observeTournament,
  saveCloudState
} from './firebase-client.js';
import { createTournamentRenderer, formatTimestamp } from './tournament-ui.js';

const els = {
  playerForm: document.getElementById('playerForm'),
  gakuranName: document.getElementById('gakuranName'),
  robloxName: document.getElementById('robloxName'),
  playerCounter: document.getElementById('playerCounter'),
  minimumStatus: document.getElementById('minimumStatus'),
  playerList: document.getElementById('playerList'),
  addExamplesBtn: document.getElementById('addExamplesBtn'),
  generateBtn: document.getElementById('generateBtn'),
  resetResultsBtn: document.getElementById('resetResultsBtn'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  printBtn: document.getElementById('printBtn'),
  qualifierPanel: document.getElementById('qualifierPanel'),
  qualifierRounds: document.getElementById('qualifierRounds'),
  bracketEmpty: document.getElementById('bracketEmpty'),
  bracketStage: document.getElementById('bracketStage'),
  bracketScroll: document.getElementById('bracketScroll'),
  bracketSummary: document.getElementById('bracketSummary'),
  firstPlace: document.getElementById('firstPlace'),
  secondPlace: document.getElementById('secondPlace'),
  thirdPlace: document.getElementById('thirdPlace'),
  toast: document.getElementById('toast'),
  liveDot: document.getElementById('liveDot'),
  connectionStatus: document.getElementById('connectionStatus'),
  lastUpdate: document.getElementById('lastUpdate'),
  loginPanel: document.getElementById('loginPanel'),
  loginForm: document.getElementById('loginForm'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  authMessage: document.getElementById('authMessage'),
  logoutBtn: document.getElementById('logoutBtn'),
  setupWarning: document.getElementById('setupWarning')
};

let state = defaultState();
let currentUser = null;
let cloudLoaded = false;
let toastTimer = null;
let saving = false;

const canAdmin = () => isConfigured && isAuthorizedUser(currentUser);

const renderer = createTournamentRenderer({
  getState: () => state,
  canEdit: canAdmin,
  onChooseWinner: async (matchId, playerId) => {
    await runWrite((draft) => {
      if (!chooseWinner(draft, matchId, playerId)) throw new Error('Não foi possível registrar esse vencedor.');
    }, `${playerLabel(findPlayer(state, playerId))} avançou de fase.`);
  },
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

function setControls() {
  const enabled = canAdmin() && !saving;
  document.querySelectorAll('[data-admin-control]').forEach((control) => {
    control.disabled = !enabled;
  });
  els.generateBtn.disabled = !enabled || state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS;
}

function renderPlayers() {
  const count = state.players.length;
  els.playerCounter.textContent = `${count}/${MAX_PLAYERS}`;
  els.minimumStatus.textContent = count >= MIN_PLAYERS ? 'Quantidade válida' : `Faltam ${MIN_PLAYERS - count}`;
  els.minimumStatus.style.color = count >= MIN_PLAYERS ? '#79e3b2' : '';

  if (!count) {
    els.playerList.innerHTML = '<div class="empty-players">Nenhum jogador cadastrado.</div>';
    setControls();
    return;
  }

  const disabled = canAdmin() ? '' : 'disabled';
  state.players.forEach((player) => {
    if (!player.id) player.id = createId('player');
  });

  els.playerList.innerHTML = state.players.map((player, index) => `
    <div class="player-item" data-player-id="${escapeHtml(player.id)}">
      <div class="player-number">${index + 1}</div>
      <div class="player-inputs">
        <input class="edit-gakuran" value="${escapeHtml(player.gakuran)}" maxlength="32" aria-label="Nome no Gakuran de ${escapeHtml(playerLabel(player))}" ${disabled} />
        <input class="edit-roblox" value="${escapeHtml(player.roblox)}" maxlength="40" placeholder="Usuário/ID do Roblox" aria-label="Usuário do Roblox de ${escapeHtml(playerLabel(player))}" ${disabled} />
      </div>
      <button class="icon-btn remove-player" type="button" title="Remover jogador" aria-label="Remover ${escapeHtml(playerLabel(player))}" ${disabled}>×</button>
    </div>
  `).join('');
  setControls();
}

function renderAuth() {
  const authorized = canAdmin();
  els.loginPanel.classList.toggle('hidden', authorized);
  els.logoutBtn.classList.toggle('hidden', !currentUser);

  if (!isConfigured) {
    els.setupWarning.classList.remove('hidden');
    els.authMessage.textContent = 'Configure o Firebase antes de entrar.';
  } else {
    els.setupWarning.classList.add('hidden');
    if (!currentUser) {
      els.authMessage.textContent = 'Somente a conta autorizada nas regras do Firebase pode alterar o placar.';
    } else if (!authorized) {
      els.authMessage.textContent = 'Esta conta entrou, mas não possui o UID autorizado.';
    }
  }
  setControls();
}

function renderAll() {
  renderPlayers();
  renderer.render();
  renderAuth();
  els.lastUpdate.textContent = formatTimestamp(state.updatedAt);
}

async function runWrite(mutator, successMessage) {
  if (!canAdmin()) {
    showToast('Entre com a conta de administrador para alterar o placar.', 'error');
    return false;
  }
  if (saving) return false;

  const previous = structuredClone(state);
  try {
    mutator(state);
    saving = true;
    renderAll();
    await saveCloudState(state);
    if (successMessage) showToast(successMessage);
    return true;
  } catch (error) {
    state = previous;
    renderAll();
    showToast(error?.message || 'Não foi possível salvar a alteração.', 'error');
    return false;
  } finally {
    saving = false;
    setControls();
  }
}

function rosterChangeWillReset() {
  if (!state.tournament) return true;
  return window.confirm('Essa alteração apagará a tabela e os resultados atuais. Continuar?');
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    els.authMessage.textContent = 'Entrando...';
    await login(els.emailInput.value.trim(), els.passwordInput.value);
    els.loginForm.reset();
  } catch (error) {
    els.authMessage.textContent = 'Não foi possível entrar. Confira o e-mail, a senha e a configuração do Firebase.';
    showToast(error?.message || 'Erro no login.', 'error');
  }
});

els.logoutBtn.addEventListener('click', async () => {
  await logout();
  showToast('Você saiu da administração.');
});

els.playerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const gakuran = els.gakuranName.value.trim();
  const roblox = els.robloxName.value.trim();
  if (!gakuran || !rosterChangeWillReset()) return;
  if (state.players.length >= MAX_PLAYERS) {
    showToast('O limite é de 40 participantes.', 'error');
    return;
  }

  const saved = await runWrite((draft) => {
    draft.tournament = null;
    draft.players.push({ id: createId('player'), gakuran, roblox });
  }, 'Jogador adicionado e placar atualizado.');

  if (saved) {
    els.playerForm.reset();
    els.gakuranName.focus();
  }
});

els.addExamplesBtn.addEventListener('click', async () => {
  if (!rosterChangeWillReset()) return;
  const remaining = MAX_PLAYERS - state.players.length;
  const amount = Math.min(Math.max(MIN_PLAYERS - state.players.length, 0), remaining);
  if (amount <= 0) {
    showToast('A lista já tem pelo menos 20 jogadores.');
    return;
  }

  await runWrite((draft) => {
    draft.tournament = null;
    for (let i = 0; i < amount; i += 1) {
      const number = draft.players.length + 1;
      draft.players.push({ id: createId('player'), gakuran: `Jogador ${number}`, roblox: `Roblox_${number}` });
    }
  }, `${amount} jogadores de teste foram adicionados.`);
});

els.playerList.addEventListener('click', async (event) => {
  const removeButton = event.target.closest('.remove-player');
  if (!removeButton || !canAdmin()) return;
  const playerId = removeButton.closest('[data-player-id]')?.dataset.playerId;
  if (!playerId || !rosterChangeWillReset()) return;

  await runWrite((draft) => {
    draft.tournament = null;
    draft.players = draft.players.filter((player) => player.id !== playerId);
  }, 'Jogador removido e placar atualizado.');
});

els.playerList.addEventListener('change', async (event) => {
  if (!canAdmin()) return;
  const item = event.target.closest('[data-player-id]');
  if (!item) return;
  const playerId = item.dataset.playerId;
  const gakuranValue = item.querySelector('.edit-gakuran')?.value.trim() || '';
  const robloxValue = item.querySelector('.edit-roblox')?.value.trim() || '';

  await runWrite((draft) => {
    const player = findPlayer(draft, playerId);
    if (!player) throw new Error('Jogador não encontrado.');
    player.gakuran = gakuranValue;
    player.roblox = robloxValue;
  }, 'Nome atualizado no placar.');
});

els.generateBtn.addEventListener('click', async () => {
  if (state.players.length < MIN_PLAYERS || state.players.length > MAX_PLAYERS) {
    showToast('Cadastre entre 20 e 40 jogadores.', 'error');
    return;
  }
  if (state.tournament && !window.confirm('Sortear novamente apagará todos os resultados. Continuar?')) return;

  const saved = await runWrite((draft) => {
    draft.tournament = buildTournament(draft.players);
  }, 'Tabela sorteada e publicada para os jogadores.');

  if (saved) els.bracketScroll.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
});

els.resetResultsBtn.addEventListener('click', async () => {
  if (!state.tournament) {
    showToast('Ainda não existe uma tabela.', 'error');
    return;
  }
  if (!window.confirm('Deseja zerar todos os resultados sem alterar os confrontos?')) return;
  await runWrite((draft) => resetResults(draft), 'Todos os resultados foram zerados.');
});

els.clearAllBtn.addEventListener('click', async () => {
  if (!state.players.length && !state.tournament) return;
  if (!window.confirm('Deseja apagar todos os jogadores, confrontos e resultados?')) return;
  await runWrite((draft) => {
    draft.players = [];
    draft.tournament = null;
  }, 'Torneio apagado.');
});

els.printBtn.addEventListener('click', () => window.print());

observeAuth(async (user) => {
  currentUser = user;
  if (user && !isAuthorizedUser(user)) {
    renderAuth();
    showToast('Esta conta não está autorizada a administrar o torneio.', 'error');
  }
  renderAll();
});

if (isConfigured) {
  setConnection('Conectando ao placar em tempo real...');
  observeTournament(
    (cloudState) => {
      state = normalizeState(cloudState);
      cloudLoaded = true;
      setConnection('Placar conectado em tempo real', 'online');
      renderAll();
    },
    (error) => {
      setConnection('Erro ao carregar o placar', 'error');
      showToast(error?.message || 'Erro ao conectar ao Firebase.', 'error');
    }
  );
} else {
  setConnection('Firebase não configurado', 'error');
  cloudLoaded = true;
  renderAll();
}

if (!cloudLoaded) renderAll();
