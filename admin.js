import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  buildTournament,
  createId,
  defaultState,
  escapeHtml,
  findPlayer,
  normalizePlayer,
  normalizeState,
  playerLabel,
  playerStyles,
  recordPoint,
  resetResults,
  undoLastPoint
} from './tournament-core.js';
import {
  deleteApplication,
  isAuthorizedUser,
  isConfigured,
  login,
  logout,
  observeApplications,
  observeAuth,
  observeTournament,
  saveCloudState
} from './firebase-client.js';
import { createTournamentRenderer, formatTimestamp } from './tournament-ui.js';

const els = {
  playerForm: document.getElementById('playerForm'),
  gakuranName: document.getElementById('gakuranName'),
  robloxName: document.getElementById('robloxName'),
  playerAge: document.getElementById('playerAge'),
  playerHeight: document.getElementById('playerHeight'),
  playerNationality: document.getElementById('playerNationality'),
  playerStyle1: document.getElementById('playerStyle1'),
  playerStyle2: document.getElementById('playerStyle2'),
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
  setupWarning: document.getElementById('setupWarning'),
  applicationCounter: document.getElementById('applicationCounter'),
  applicationList: document.getElementById('applicationList'),
  registrationToggleBtn: document.getElementById('registrationToggleBtn'),
  registrationStatusText: document.getElementById('registrationStatusText')
};

let state = defaultState();
let currentUser = null;
let applications = [];
let applicationsUnsubscribe = null;
let cloudLoaded = false;
let toastTimer = null;
let saving = false;

const canAdmin = () => isConfigured && isAuthorizedUser(currentUser);

const renderer = createTournamentRenderer({
  getState: () => state,
  canEdit: canAdmin,
  onRecordPoint: async (matchId, playerId, choices) => {
    await runWrite((draft) => {
      if (!recordPoint(draft, matchId, playerId, choices)) {
        throw new Error('Não foi possível registrar esse ponto. Confira se o grupo já terminou.');
      }
    }, `${playerLabel(findPlayer(state, playerId))} marcou um ponto.`);
  },
  onUndoPoint: async (matchId) => {
    await runWrite((draft) => {
      if (!undoLastPoint(draft, matchId)) throw new Error('Não existe round para desfazer.');
    }, 'O último round foi removido.');
  },
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

function validRoster() {
  const count = state.players.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) return false;
  if (count > 16 && count % 2 !== 0) return false;
  return true;
}

function setControls() {
  const enabled = canAdmin() && !saving;
  document.querySelectorAll('[data-admin-control]').forEach((control) => {
    control.disabled = !enabled;
  });
  els.generateBtn.disabled = !enabled || !validRoster();
  els.registrationToggleBtn.disabled = !enabled;
}

function renderRegistrationControl() {
  const open = state.registrationOpen !== false;
  els.registrationToggleBtn.textContent = open ? '🔒 Fechar inscrições' : '🔓 Abrir inscrições';
  els.registrationToggleBtn.className = `btn wide ${open ? 'btn-danger' : 'btn-gold'}`;
  els.registrationStatusText.textContent = open
    ? 'Jogadores podem enviar candidaturas pelo site público.'
    : 'O formulário público está bloqueado para novas candidaturas.';
}

function renderApplications() {
  els.applicationCounter.textContent = `${applications.length} pendente${applications.length === 1 ? '' : 's'}`;
  if (!canAdmin()) {
    els.applicationList.innerHTML = '<div class="empty-players">Entre como administrador para ver as candidaturas.</div>';
    return;
  }
  if (!applications.length) {
    els.applicationList.innerHTML = '<div class="empty-players">Nenhuma candidatura pendente.</div>';
    return;
  }

  els.applicationList.innerHTML = applications.map((application) => {
    const styles = Array.isArray(application.styles) ? application.styles.filter(Boolean) : [];
    return `
      <article class="application-card" data-application-id="${escapeHtml(application.id)}">
        <div class="application-card-head">
          <strong>${escapeHtml(application.fullName || 'Sem nome')}</strong>
          <span>${escapeHtml(application.roblox || 'Sem Roblox')}</span>
        </div>
        <p>${escapeHtml(application.age || '?')} anos • ${escapeHtml(application.nationality || '?')} • ${escapeHtml(application.height || '?')} m</p>
        <p class="application-styles">🥋 ${escapeHtml(styles.join(' + ') || 'Estilo não informado')}</p>
        <div class="application-actions">
          <button class="btn btn-small btn-gold" type="button" data-action="approve-application">✓ Aprovar</button>
          <button class="btn btn-small btn-danger" type="button" data-action="reject-application">Recusar</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderPlayers() {
  const count = state.players.length;
  els.playerCounter.textContent = `${count}/${MAX_PLAYERS}`;

  if (count < MIN_PLAYERS) {
    els.minimumStatus.textContent = `Faltam ${MIN_PLAYERS - count}`;
    els.minimumStatus.className = 'counter warning';
  } else if (count > 16 && count % 2 !== 0) {
    els.minimumStatus.textContent = 'Acima de 16: precisa ser par';
    els.minimumStatus.className = 'counter warning';
  } else {
    els.minimumStatus.textContent = 'Quantidade válida';
    els.minimumStatus.className = 'counter valid';
  }

  if (!count) {
    els.playerList.innerHTML = '<div class="empty-players">Nenhum jogador aprovado.</div>';
    setControls();
    return;
  }

  const disabled = canAdmin() ? '' : 'disabled';
  state.players = state.players.map(normalizePlayer).filter(Boolean);

  els.playerList.innerHTML = state.players.map((player, index) => {
    const styles = playerStyles(player);
    return `
      <article class="player-item expanded" data-player-id="${escapeHtml(player.id)}">
        <div class="player-number">${index + 1}</div>
        <div class="player-edit-grid">
          <input data-field="fullName" value="${escapeHtml(player.fullName)}" maxlength="48" aria-label="Nome" ${disabled} />
          <input data-field="roblox" value="${escapeHtml(player.roblox)}" maxlength="48" aria-label="Roblox" ${disabled} />
          <div class="player-mini-fields">
            <input data-field="age" type="number" min="12" max="99" value="${escapeHtml(player.age)}" aria-label="Idade" ${disabled} />
            <input data-field="height" type="number" min="1.40" max="2.20" step="0.01" value="${escapeHtml(player.height)}" aria-label="Altura" ${disabled} />
          </div>
          <input data-field="nationality" value="${escapeHtml(player.nationality)}" maxlength="32" aria-label="Nacionalidade" ${disabled} />
          <div class="player-mini-fields">
            <input data-field="style1" list="styleSuggestions" value="${escapeHtml(styles[0] || '')}" maxlength="32" aria-label="Estilo 1" ${disabled} />
            <input data-field="style2" list="styleSuggestions" value="${escapeHtml(styles[1] || '')}" maxlength="32" aria-label="Estilo 2" placeholder="2º estilo" ${disabled} />
          </div>
        </div>
        <button class="icon-btn remove-player" type="button" title="Remover jogador" aria-label="Remover ${escapeHtml(playerLabel(player))}" ${disabled}>×</button>
      </article>
    `;
  }).join('');
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
      els.authMessage.textContent = 'Somente a conta autorizada pode alterar o placar.';
    } else if (!authorized) {
      els.authMessage.textContent = 'Esta conta entrou, mas não possui o UID autorizado.';
    }
  }
  setControls();
}

function renderAll() {
  renderRegistrationControl();
  renderApplications();
  renderPlayers();
  renderer.render();
  renderAuth();
  els.lastUpdate.textContent = formatTimestamp(state.updatedAt);
}

async function runWrite(mutator, successMessage) {
  if (!canAdmin()) {
    showToast('Entre com a conta de administrador para alterar o torneio.', 'error');
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
  return window.confirm('Essa alteração apagará a tabela e todos os placares atuais. Continuar?');
}

function playerFromApplication(application) {
  return normalizePlayer({
    id: createId('player'),
    fullName: application.fullName,
    roblox: application.roblox,
    age: application.age,
    nationality: application.nationality,
    height: application.height,
    styles: application.styles,
    applicationId: application.id
  });
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    els.authMessage.textContent = 'Entrando...';
    await login(els.emailInput.value.trim(), els.passwordInput.value);
    els.loginForm.reset();
  } catch (error) {
    els.authMessage.textContent = 'Não foi possível entrar. Confira o e-mail e a senha.';
    showToast(error?.message || 'Erro no login.', 'error');
  }
});

els.logoutBtn.addEventListener('click', async () => {
  await logout();
  showToast('Você saiu da administração.');
});

els.registrationToggleBtn.addEventListener('click', async () => {
  await runWrite((draft) => {
    draft.registrationOpen = draft.registrationOpen === false;
  }, state.registrationOpen === false ? 'Inscrições abertas.' : 'Inscrições fechadas.');
});

els.applicationList.addEventListener('click', async (event) => {
  const card = event.target.closest('[data-application-id]');
  if (!card || !canAdmin()) return;
  const application = applications.find((item) => item.id === card.dataset.applicationId);
  if (!application) return;

  if (event.target.closest('[data-action="approve-application"]')) {
    if (state.players.length >= MAX_PLAYERS) {
      showToast('O limite é de 40 participantes.', 'error');
      return;
    }
    if (!rosterChangeWillReset()) return;
    const saved = await runWrite((draft) => {
      draft.tournament = null;
      draft.players.push(playerFromApplication(application));
    }, `${application.fullName} foi aprovado.`);
    if (saved) {
      try {
        await deleteApplication(application.id);
      } catch {
        showToast('Jogador aprovado, mas a candidatura não pôde ser removida da caixa.', 'error');
      }
    }
    return;
  }

  if (event.target.closest('[data-action="reject-application"]')) {
    if (!window.confirm(`Recusar a candidatura de ${application.fullName || 'este jogador'}?`)) return;
    try {
      await deleteApplication(application.id);
      showToast('Candidatura recusada.');
    } catch (error) {
      showToast(error?.message || 'Não foi possível recusar.', 'error');
    }
  }
});

els.playerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!rosterChangeWillReset()) return;
  if (state.players.length >= MAX_PLAYERS) {
    showToast('O limite é de 40 participantes.', 'error');
    return;
  }

  const style1 = els.playerStyle1.value.trim();
  const style2 = els.playerStyle2.value.trim();
  if (style2 && style2.toLowerCase() === style1.toLowerCase()) {
    showToast('O segundo estilo precisa ser diferente ou ficar vazio.', 'error');
    return;
  }

  const player = normalizePlayer({
    id: createId('player'),
    fullName: els.gakuranName.value.trim(),
    roblox: els.robloxName.value.trim(),
    age: els.playerAge.value.trim(),
    height: Number(els.playerHeight.value).toFixed(2),
    nationality: els.playerNationality.value.trim(),
    styles: [style1, style2].filter(Boolean)
  });

  const saved = await runWrite((draft) => {
    draft.tournament = null;
    draft.players.push(player);
  }, 'Jogador adicionado.');

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
    showToast('A lista já possui pelo menos 4 jogadores.');
    return;
  }
  const exampleStyles = ['Capoeira', 'Kure', 'Boxing', 'Muay Thai'];
  await runWrite((draft) => {
    draft.tournament = null;
    for (let i = 0; i < amount; i += 1) {
      const number = draft.players.length + 1;
      draft.players.push(normalizePlayer({
        id: createId('player'),
        fullName: `Jogador ${number}`,
        roblox: `Roblox_${number}`,
        age: '17',
        height: (1.70 + (number % 10) / 100).toFixed(2),
        nationality: 'Japonês',
        styles: [exampleStyles[number % exampleStyles.length]]
      }));
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
  }, 'Jogador removido.');
});

els.playerList.addEventListener('change', async (event) => {
  if (!canAdmin()) return;
  const item = event.target.closest('[data-player-id]');
  if (!item) return;
  const playerId = item.dataset.playerId;
  if (state.tournament && !rosterChangeWillReset()) {
    renderAll();
    return;
  }

  const values = {};
  item.querySelectorAll('[data-field]').forEach((input) => {
    values[input.dataset.field] = input.value.trim();
  });
  if (!values.fullName || !values.style1) {
    showToast('Nome e Estilo 1 são obrigatórios.', 'error');
    renderAll();
    return;
  }
  if (values.style2 && values.style2.toLowerCase() === values.style1.toLowerCase()) {
    showToast('Os dois estilos precisam ser diferentes.', 'error');
    renderAll();
    return;
  }

  await runWrite((draft) => {
    draft.tournament = null;
    const player = findPlayer(draft, playerId);
    if (!player) throw new Error('Jogador não encontrado.');
    Object.assign(player, {
      fullName: values.fullName,
      gakuran: values.fullName,
      roblox: values.roblox,
      age: values.age,
      height: values.height,
      nationality: values.nationality,
      styles: [values.style1, values.style2].filter(Boolean)
    });
  }, 'Ficha do jogador atualizada.');
});

els.generateBtn.addEventListener('click', async () => {
  if (!validRoster()) {
    showToast('Use de 4 a 40 participantes. Acima de 16, a quantidade precisa ser par.', 'error');
    return;
  }
  if (state.tournament && !window.confirm('Sortear novamente apagará todos os placares. Continuar?')) return;

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
  if (!window.confirm('Deseja zerar todos os placares sem mudar os confrontos?')) return;
  await runWrite((draft) => resetResults(draft), 'Todos os placares foram zerados.');
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

observeAuth((user) => {
  currentUser = user;
  if (canAdmin() && !applicationsUnsubscribe) {
    applicationsUnsubscribe = observeApplications(
      (items) => {
        applications = items;
        renderApplications();
      },
      (error) => showToast(error?.message || 'Não foi possível carregar as candidaturas.', 'error')
    );
  } else if (!canAdmin() && applicationsUnsubscribe) {
    applicationsUnsubscribe();
    applicationsUnsubscribe = null;
    applications = [];
  }

  if (user && !isAuthorizedUser(user)) {
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
