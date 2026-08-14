import { SITE_CONFIG, isApiConfigured } from './site-config.js?v=6';
import { Api, consumeTokenFromHash, getToken, setToken, startDiscordLogin } from './api.js';
import {
  buildTournament,
  normalizePlayer,
  recordPoint,
  resetResults,
  undoLastPoint,
} from './tournament-core.js';
import { createTournamentRenderer } from './tournament-ui.js';

const app = document.getElementById('app');
const toast = document.getElementById('toast');
const demoRole = new URLSearchParams(location.search).get('demo');
const isDemo = ['member', 'captain', 'admin', 'founder'].includes(demoRole);

const state = {
  me: null,
  home: null,
  tournaments: [],
  division: null,
  profile: null,
  route: 'home',
  mobileMenu: false,
  activeTournament: null,
  activeBracketState: null,
  demo: isDemo,
};

let toastTimer = null;
function showToast(message, type = 'normal') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return 'Data a definir';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusLabel(t) {
  const map = { draft: 'Rascunho', open: 'Inscrições abertas', running: 'Em andamento', finished: 'Finalizado', cancelled: 'Cancelado', closed: 'Inscrições encerradas' };
  return map[t.status] || t.status || 'A definir';
}

function scopeLabel(t) {
  if (t.scope === 'division') return t.division_display_name || 'Torneio de divisão';
  if (t.scope === 'special') return 'Torneio especial';
  return 'Torneio geral';
}

function accessLabel(access = {}) {
  if (access.isFounder) return 'Fundador';
  if (access.isAdmin) return 'Administrador';
  if (access.isCaptain) return 'Capitão';
  return 'Membro';
}

function demoUser() {
  const level = demoRole || 'member';
  return {
    user: { id: '100000000001', username: 'Yoru', globalName: 'Yoru', avatarUrl: '' },
    access: {
      level,
      isFounder: level === 'founder',
      isAdmin: ['admin', 'founder'].includes(level),
      isCaptain: ['captain', 'admin', 'founder'].includes(level),
      canManageDivision: ['captain', 'admin', 'founder'].includes(level),
      canManageGlobal: ['admin', 'founder'].includes(level),
      canManageAdmins: level === 'founder',
    },
    division: {
      id: 2,
      key: 'division_2',
      displayName: 'Segunda Divisão',
      roleId: '2000002',
      captainUserId: '100000000001',
    },
  };
}

const demoProfiles = new Map([
  ['100000000001', { characterName: 'Yoru Yoshino', robloxNick: 'Anjoharkead0', age: '14', nationality: 'Japonês', height: '1.79', fightingStyle1: 'Capoeira', fightingStyle2: '' }],
]);

const demoMembers = [
  ['100000000001', 'Yoru Yoshino', 'Yoru'], ['100000000002', 'Akira Sano', 'akira'], ['100000000003', 'Ren Kuroda', 'ren'],
  ['100000000004', 'Haru Aoki', 'haru'], ['100000000005', 'Shin Mori', 'shin'], ['100000000006', 'Kai Endo', 'kai'],
].map(([id, characterName, username]) => ({ id, characterName, username, avatarUrl: '' }));

let demoTournamentId = 12;
const demoTournaments = [
  {
    id: 10, name: 'Copa Divina Tokyo', description: 'Torneio geral da gangue.', scope: 'general', event_at: new Date(Date.now() + 86400000 * 4).toISOString(),
    max_participants: 32, status: 'open', registration_open: true, division_key: null, prizes_json: ['Cargo especial', 'Destaque no servidor', 'Menção de honra'], state_json: null,
    created_by: '100000000001', entries_count: 18, can_manage: ['admin','founder'].includes(demoRole), joined: false,
  },
  {
    id: 11, name: 'Desafio da Segunda', description: 'Torneio interno para definir o destaque da divisão.', scope: 'division', division_key: 'division_2', division_display_name: 'Segunda Divisão', event_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    max_participants: 16, status: 'open', registration_open: true, prizes_json: ['Destaque da Segunda Divisão'], state_json: null,
    created_by: '100000000001', entries_count: 6, can_manage: ['captain','admin','founder'].includes(demoRole), joined: true,
  },
];

function demoEntries(tournament) {
  const count = tournament.scope === 'division' ? 6 : 12;
  const names = ['Yoru Yoshino','Akira Sano','Ren Kuroda','Haru Aoki','Shin Mori','Kai Endo','Riku Hayashi','Sora Ito','Kento Abe','Nagi Kato','Rei Fuji','Toma Ono'];
  return names.slice(0, count).map((name, index) => ({
    user_id: `1000000000${String(index + 1).padStart(2, '0')}`,
    username: name.split(' ')[0],
    profile: { characterName: name, robloxNick: `Player_${index + 1}`, age: String(14 + index % 4), nationality: 'Japonês', height: `1.${70 + index}`, fightingStyle1: index % 2 ? 'Kure' : 'Capoeira', fightingStyle2: '' },
  }));
}

const Data = {
  async me() { return state.demo ? demoUser() : Api.me(); },
  async home() {
    if (!state.demo) return Api.home();
    return {
      stats: { members: 58, divisions: 3, openTournaments: 2 },
      divisions: [
        { key: 'division_1', displayName: 'Primeira Divisão', members: 18 },
        { key: 'division_2', displayName: 'Segunda Divisão', members: 20 },
        { key: 'division_3', displayName: 'Terceira Divisão', members: 20 },
      ],
      upcoming: demoTournaments,
    };
  },
  async tournaments() { return state.demo ? structuredClone(demoTournaments) : Api.tournaments(); },
  async tournament(id) {
    if (!state.demo) return Api.tournament(id);
    const t = demoTournaments.find((item) => String(item.id) === String(id));
    if (!t) throw new Error('Torneio não encontrado.');
    return { tournament: structuredClone(t), entries: demoEntries(t) };
  },
  async division() {
    if (!state.demo) return Api.division();
    return { division: demoUser().division, members: demoMembers, tournaments: demoTournaments.filter((t) => t.scope === 'division') };
  },
  async profile() {
    if (!state.demo) return Api.profile();
    return { profile: demoProfiles.get('100000000001') || null };
  },
  async saveProfile(profile) {
    if (!state.demo) return Api.saveProfile(profile);
    demoProfiles.set('100000000001', profile); return { profile };
  },
  async createTournament(payload) {
    if (!state.demo) return Api.createTournament(payload);
    const created = { id: ++demoTournamentId, ...payload, event_at: payload.eventAt, max_participants: payload.maxParticipants, status: 'open', registration_open: true, prizes_json: payload.prizes || [], state_json: null, can_manage: true, joined: false, entries_count: 0, division_display_name: payload.scope === 'division' ? demoUser().division.displayName : null };
    demoTournaments.unshift(created); return { tournament: created };
  },
  async updateTournament(id, payload) {
    if (!state.demo) return Api.updateTournament(id, payload);
    const t = demoTournaments.find((item) => String(item.id) === String(id)); Object.assign(t, payload); return { tournament: t };
  },
  async saveBracket(id, bracketState) {
    if (!state.demo) return Api.saveBracket(id, bracketState);
    const t = demoTournaments.find((item) => String(item.id) === String(id)); t.state_json = structuredClone(bracketState); return { state: bracketState };
  },
  async join(id) {
    if (!state.demo) return Api.joinTournament(id);
    const t = demoTournaments.find((item) => String(item.id) === String(id)); t.joined = true; t.entries_count += 1; return { ok: true };
  },
  async leave(id) {
    if (!state.demo) return Api.leaveTournament(id);
    const t = demoTournaments.find((item) => String(item.id) === String(id)); t.joined = false; t.entries_count = Math.max(0, t.entries_count - 1); return { ok: true };
  },
  async admins() {
    if (!state.demo) return Api.admins();
    return { admins: [{ userId: '100000000001', displayName: 'Yoru', active: true }, { userId: '100000000099', displayName: 'Thiago', active: true }] };
  },
  async addAdmin(payload) { return state.demo ? { admin: payload } : Api.addAdmin(payload); },
  async removeAdmin(userId) { return state.demo ? { ok: true, userId } : Api.removeAdmin(userId); },
};

function renderLanding() {
  app.innerHTML = `
    <main class="landing">
      <section class="landing-card">
        <div class="brand-mark-wrap"><img src="./assets/divina-tokyo-emblema.png" alt="Emblema Divina Tokyo" class="brand-mark"></div>
        <p class="eyebrow">QUARTEL DIGITAL OFICIAL</p>
        <h1>〚神聖〛<span>ＤＩＶＩＮＡ・ＴＯＫＹＯ</span></h1>
        <p class="landing-copy">Divisões, torneios internos, placares e organização da gangue em um só lugar.</p>
        <button class="discord-login" id="discordLogin">◈ Entrar com Discord</button>
        ${!isApiConfigured() ? `<div class="setup-warning"><strong>Integração preparada.</strong><span>A API do Amateru ainda precisa receber a URL final. O site já está pronto para o login do Discord e o banco do bot.</span></div>` : ''}
        <div class="landing-features">
          <span>⚔️ Torneios</span><span>隊 Divisões</span><span>🏆 Placares</span><span>🔒 Acesso por cargo</span>
        </div>
      </section>
    </main>`;
  document.getElementById('discordLogin').addEventListener('click', () => {
    try { startDiscordLogin(); } catch (error) { showToast(error.message, 'error'); }
  });
}

function navItems() {
  const me = state.me;
  const items = [
    ['home', '⌂', 'Início'],
    ['tournaments', '杯', 'Torneios'],
  ];
  if (me?.division) items.push(['division', '隊', 'Minha Divisão']);
  items.push(['profile', '人', 'Perfil Gakuran']);
  if (me?.access?.isAdmin || me?.access?.isFounder) items.push(['admin', '統', 'Administração']);
  if (me?.access?.isFounder) items.push(['access', '鍵', 'Acessos']);
  return items;
}

function renderShell() {
  const me = state.me;
  const avatar = me.user.avatarUrl
    ? `<img src="${esc(me.user.avatarUrl)}" alt="">`
    : `<span>${esc((me.user.globalName || me.user.username || '?').slice(0, 1).toUpperCase())}</span>`;
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <button class="mobile-menu-btn" data-action="toggle-menu">☰</button>
        <div class="top-brand"><img src="./assets/divina-tokyo-emblema.png" alt=""><div><strong>〚神聖〛ＤＩＶＩＮＡ・ＴＯＫＹＯ</strong><small>Quartel digital</small></div></div>
        <div class="user-pill"><div class="avatar">${avatar}</div><div><strong>${esc(me.user.globalName || me.user.username)}</strong><small>${esc(accessLabel(me.access))}${me.division ? ` • ${esc(me.division.displayName)}` : ''}</small></div></div>
      </header>
      <div class="body-grid">
        <aside class="sidebar ${state.mobileMenu ? 'open' : ''}">
          <div class="sidebar-brand"><span class="sun">✦</span><div><strong>DIVINA TOKYO</strong><small>神聖 • 東京</small></div></div>
          <nav>${navItems().map(([route, icon, label]) => `<button class="nav-item ${state.route === route ? 'active' : ''}" data-route="${route}"><span>${icon}</span>${label}</button>`).join('')}</nav>
          <div class="sidebar-note"><strong>${esc(accessLabel(me.access))}</strong><span>${me.access?.isCaptain && !me.access?.isAdmin ? 'Você gerencia apenas a sua divisão.' : me.access?.isAdmin ? 'Acesso administrativo liberado.' : 'Acesso de membro.'}</span></div>
          <button class="logout-btn" data-action="logout">Sair</button>
        </aside>
        <main class="content" id="content"><div class="loading-card"><span class="spinner"></span>Carregando...</div></main>
      </div>
    </div>`;
}

function setRoute(route) {
  state.route = route;
  state.mobileMenu = false;
  renderShell();
  void renderRoute();
}

async function renderRoute() {
  const content = document.getElementById('content');
  if (!content) return;
  try {
    if (state.route === 'home') await renderHome(content);
    else if (state.route === 'tournaments') await renderTournaments(content);
    else if (state.route === 'division') await renderDivision(content);
    else if (state.route === 'profile') await renderProfile(content);
    else if (state.route === 'admin') await renderAdmin(content);
    else if (state.route === 'access') await renderAccess(content);
    else await renderHome(content);
  } catch (error) {
    content.innerHTML = `<section class="error-card"><strong>Não foi possível carregar esta área.</strong><span>${esc(error.message)}</span></section>`;
  }
}

function pageHead(kicker, title, subtitle, actions = '') {
  return `<div class="page-head"><div><p class="eyebrow">${esc(kicker)}</p><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${actions}</div>`;
}

function tournamentCard(t) {
  const prizes = Array.isArray(t.prizes_json) ? t.prizes_json : (Array.isArray(t.prizes) ? t.prizes : []);
  return `<article class="tournament-card" data-tournament-id="${esc(t.id)}">
    <div class="tournament-card-top"><span class="scope-badge ${esc(t.scope || 'general')}">${esc(scopeLabel(t))}</span><span class="status-badge">${esc(statusLabel(t))}</span></div>
    <h3>${esc(t.name)}</h3>
    <p>${esc(t.description || 'Sem descrição.')}</p>
    <div class="tournament-meta"><span>◷ ${esc(formatDate(t.event_at || t.eventAt))}</span><span>人 ${Number(t.entries_count ?? t.entries?.length ?? 0)}/${Number(t.max_participants || t.maxParticipants || 0)}</span></div>
    ${prizes.length ? `<div class="mini-prize">🏆 ${esc(prizes[0]?.reward || prizes[0])}</div>` : ''}
    <button class="card-open" data-action="open-tournament" data-id="${esc(t.id)}">Abrir torneio →</button>
  </article>`;
}

async function renderHome(content) {
  state.home = await Data.home();
  const upcoming = state.home.upcoming || [];
  content.innerHTML = `
    ${pageHead('〚神聖〛 DIVINA TOKYO', 'Quartel digital', 'A organização da gangue conectada ao Discord, às divisões e aos torneios.')}
    <section class="hero-panel">
      <img src="./assets/divina-tokyo-emblema.png" alt="" class="hero-watermark">
      <div><span class="hero-kicker">神聖 • 絆 • 忠誠</span><h3>Uma gangue. Uma estrutura. Um legado.</h3><p>Seu cargo no Discord define automaticamente o que você pode ver e administrar aqui.</p></div>
      <div class="hero-role"><small>SEU ACESSO</small><strong>${esc(accessLabel(state.me.access))}</strong>${state.me.division ? `<span>${esc(state.me.division.displayName)}</span>` : ''}</div>
    </section>
    <section class="stat-grid">
      <article><span>MEMBROS</span><strong>${Number(state.home.stats?.members || 0)}</strong><small>no servidor</small></article>
      <article><span>DIVISÕES</span><strong>${Number(state.home.stats?.divisions || 0)}</strong><small>ativas</small></article>
      <article><span>TORNEIOS</span><strong>${Number(state.home.stats?.openTournaments || 0)}</strong><small>abertos</small></article>
    </section>
    <section class="section-block">
      <div class="section-title"><div><span>PRÓXIMOS EVENTOS</span><h3>Torneios em destaque</h3></div><button class="text-btn" data-route="tournaments">Ver todos</button></div>
      <div class="card-grid">${upcoming.length ? upcoming.slice(0, 3).map(tournamentCard).join('') : '<div class="empty-card">Nenhum torneio aberto no momento.</div>'}</div>
    </section>
    <section class="section-block">
      <div class="section-title"><div><span>ESTRUTURA</span><h3>Divisões</h3></div></div>
      <div class="division-mini-grid">${(state.home.divisions || []).map((d) => `<div><strong>${esc(d.displayName)}</strong><span>${Number(d.members || 0)} membros</span></div>`).join('')}</div>
    </section>`;
}

async function renderTournaments(content) {
  state.tournaments = await Data.tournaments();
  content.innerHTML = `
    ${pageHead('TORNEIOS', 'Arena oficial', 'Você só recebe torneios que sua conta tem permissão para visualizar.')}
    <div class="filter-row"><button class="filter-chip active">Todos</button><span>${state.tournaments.length} torneio(s) visível(is)</span></div>
    <section class="card-grid">${state.tournaments.length ? state.tournaments.map(tournamentCard).join('') : '<div class="empty-card">Nenhum torneio disponível.</div>'}</section>`;
}

async function openTournament(id) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading-card"><span class="spinner"></span>Abrindo torneio...</div>';
  const result = await Data.tournament(id);
  state.activeTournament = result;
  const t = result.tournament;
  const entries = result.entries || [];
  const canManage = Boolean(t.can_manage);
  const profileComplete = result.profile_complete !== false;
  const prizes = Array.isArray(t.prizes_json) ? t.prizes_json : [];

  content.innerHTML = `
    <button class="back-btn" data-route="tournaments">← Voltar aos torneios</button>
    <section class="tournament-hero">
      <div><span class="scope-badge ${esc(t.scope || 'general')}">${esc(scopeLabel(t))}</span><h2>${esc(t.name)}</h2><p>${esc(t.description || 'Torneio oficial da Divina Tokyo.')}</p><div class="tournament-meta"><span>◷ ${esc(formatDate(t.event_at))}</span><span>人 ${entries.length}/${Number(t.max_participants || 0)}</span><span>● ${esc(statusLabel(t))}</span></div></div>
      <div class="prize-panel"><span>PREMIAÇÃO</span>${prizes.length ? prizes.map((reward, index) => `<div><b>${index + 1}º</b><strong>${esc(reward?.reward || reward)}</strong></div>`).join('') : '<small>Sem premiação definida.</small>'}</div>
    </section>
    <section class="tournament-actions">
      ${t.registration_open && t.status === 'open' && !t.joined ? `<button class="primary-btn" data-action="join-tournament" data-id="${esc(t.id)}" ${profileComplete ? '' : 'disabled'}>⚔️ Inscrever-se</button>` : ''}
      ${t.joined ? `<button class="secondary-btn" data-action="leave-tournament" data-id="${esc(t.id)}">Cancelar inscrição</button>` : ''}
      ${!profileComplete ? '<span class="action-note">Complete o Perfil Gakuran antes de se inscrever.</span>' : ''}
      ${canManage ? `<button class="secondary-btn" data-action="toggle-registration" data-id="${esc(t.id)}" data-open="${t.registration_open ? '1' : '0'}">${t.registration_open ? '🔒 Fechar inscrições' : '🔓 Abrir inscrições'}</button><button class="gold-outline-btn" data-action="generate-bracket" data-id="${esc(t.id)}">🎲 ${t.state_json?.tournament ? 'Refazer chave' : 'Gerar chave'}</button>` : ''}
    </section>
    <section class="split-grid">
      <article class="panel"><div class="panel-head"><div><span>INSCRITOS</span><h3>${entries.length} participantes</h3></div></div><div class="member-list">${entries.length ? entries.map((entry, i) => participantRow(entry, i + 1)).join('') : '<div class="empty-mini">Nenhum inscrito.</div>'}</div></article>
      <article class="panel rules-panel"><div class="panel-head"><div><span>REGRAS DO PLACAR</span><h3>Melhor de 3</h3></div></div><p>Cada vitória de round vale 1 ponto. Quem alcançar <strong>2 pontos</strong> vence a luta: 2×0 ou 2×1.</p><p>Se o jogador cadastrou dois estilos, o 1º round usa o primeiro e o 2º usa o segundo. Em 1×1, o estilo do terceiro round é escolhido antes da luta.</p></article>
    </section>
    <section class="bracket-wrap">
      <div class="section-title"><div><span>PLACAR</span><h3>Chave do torneio</h3></div>${canManage && t.state_json?.tournament ? '<button class="danger-text" data-action="reset-bracket-results">Zerar resultados</button>' : ''}</div>
      <div class="status-grid"><article class="standing gold"><span>🥇 Campeão</span><strong id="firstPlace">A definir</strong></article><article class="standing silver"><span>🥈 Vice</span><strong id="secondPlace">A definir</strong></article><article class="standing bronze"><span>🥉 Terceiro</span><strong id="thirdPlace">A definir</strong></article></div>
      <section class="qualifier-panel" id="qualifierPanel" hidden><div class="section-toolbar"><div><h3>Fase eliminatória</h3><p>Todos os jogadores desta etapa participam.</p></div></div><div id="qualifierRounds" class="qualifier-rounds"></div></section>
      <section class="bracket-panel"><div class="bracket-toolbar"><div><h3>Tabela</h3><p id="bracketSummary">Aguardando a chave.</p></div></div><div class="bracket-scroll" id="bracketScroll"><div class="bracket-empty" id="bracketEmpty"><div><div class="empty-icon">⚔️</div><h3>A chave ainda não foi criada</h3><p>Quando as inscrições acabarem, o responsável pode gerar a chave.</p></div></div><div class="bracket-stage" id="bracketStage" hidden><svg class="connections" id="connections"></svg></div></div></section>
    </section>`;

  const players = entries.map((entry) => entryToPlayer(entry));
  state.activeBracketState = t.state_json?.tournament
    ? { ...structuredClone(t.state_json), players: t.state_json.players?.length ? t.state_json.players : players }
    : { players, tournament: null };
  setupBracketRenderer(canManage);
}

function participantRow(entry, number) {
  const p = entry.profile || {};
  const label = p.characterName || entry.global_name || entry.username || entry.user_id;
  const meta = [p.fightingStyle1, p.fightingStyle2].filter(Boolean).join(' + ');
  return `<div class="member-row"><span class="member-number">${number}</span><div class="avatar small">${esc(label.slice(0,1).toUpperCase())}</div><div><strong>${esc(label)}</strong><small>${esc(meta || `Discord: ${entry.username || entry.user_id}`)}</small></div></div>`;
}

function entryToPlayer(entry) {
  const p = entry.profile || {};
  return normalizePlayer({
    id: entry.user_id,
    fullName: p.characterName || entry.global_name || entry.username || entry.user_id,
    roblox: p.robloxNick || '', age: p.age || '', nationality: p.nationality || '', height: p.height || '',
    styles: [p.fightingStyle1 || 'Basic', p.fightingStyle2].filter(Boolean),
  });
}

function setupBracketRenderer(canManage) {
  const elements = {
    qualifierPanel: document.getElementById('qualifierPanel'), qualifierRounds: document.getElementById('qualifierRounds'),
    bracketEmpty: document.getElementById('bracketEmpty'), bracketStage: document.getElementById('bracketStage'), bracketScroll: document.getElementById('bracketScroll'),
    bracketSummary: document.getElementById('bracketSummary'), firstPlace: document.getElementById('firstPlace'), secondPlace: document.getElementById('secondPlace'), thirdPlace: document.getElementById('thirdPlace'),
  };
  if (Object.values(elements).some((el) => !el)) return;
  const renderer = createTournamentRenderer({
    getState: () => state.activeBracketState,
    canEdit: () => canManage,
    onRecordPoint: async (matchId, playerId, choices) => {
      if (!recordPoint(state.activeBracketState, matchId, playerId, choices)) return;
      renderer.render();
      await persistBracket();
    },
    onUndoPoint: async (matchId) => {
      if (!undoLastPoint(state.activeBracketState, matchId)) return;
      renderer.render();
      await persistBracket();
    },
    elements,
  });
  renderer.render();
  state.activeRenderer = renderer;
}

async function persistBracket() {
  const id = state.activeTournament?.tournament?.id;
  if (!id) return;
  try { await Data.saveBracket(id, state.activeBracketState); }
  catch (error) { showToast(`Placar alterado na tela, mas não foi salvo: ${error.message}`, 'error'); }
}

async function renderDivision(content) {
  const result = await Data.division();
  state.division = result;
  const d = result.division;
  if (!d) { content.innerHTML = '<div class="empty-card">Sua conta não está vinculada a uma divisão.</div>'; return; }
  const canManage = Boolean(state.me.access?.canManageDivision);
  content.innerHTML = `
    ${pageHead('MINHA DIVISÃO', d.displayName, canManage ? 'Você é responsável por esta divisão. As ferramentas de edição ficam apenas aqui.' : 'Área privada dos membros da sua divisão.', canManage ? '<button class="primary-btn" data-action="open-create-division-tournament">＋ Criar torneio</button>' : '')}
    <section class="division-banner"><div><span>隊</span><div><small>DIVISÃO</small><h3>${esc(d.displayName)}</h3><p>Capitão: ${d.captainUserId === state.me.user.id ? 'Você' : d.captainName || 'A definir'}</p></div></div><div class="privacy-seal">🔒 <strong>Área privada</strong><span>Somente esta divisão</span></div></section>
    <section class="split-grid">
      <article class="panel"><div class="panel-head"><div><span>MEMBROS</span><h3>${(result.members || []).length} integrantes</h3></div></div><div class="member-list">${(result.members || []).map((m, i) => `<div class="member-row"><span class="member-number">${i + 1}</span><div class="avatar small">${esc((m.characterName || m.globalName || m.username || '?').slice(0,1).toUpperCase())}</div><div><strong>${esc(m.characterName || m.globalName || m.username)}</strong><small>${m.id === d.captainUserId ? 'Capitão' : 'Membro'}</small></div></div>`).join('')}</div></article>
      <article class="panel"><div class="panel-head"><div><span>TORNEIOS INTERNOS</span><h3>Exclusivos da divisão</h3></div></div><div class="stack-cards">${(result.tournaments || []).length ? result.tournaments.map(tournamentCard).join('') : '<div class="empty-mini">Nenhum torneio interno.</div>'}</div></article>
    </section>
    ${canManage ? `<section class="captain-zone"><div><span>PAINEL DO CAPITÃO</span><h3>Seu poder termina nesta divisão.</h3><p>Você pode criar e administrar torneios internos, abrir ou fechar inscrições e registrar o placar. Nenhum controle global da gangue aparece para capitães.</p></div><span class="captain-badge">隊 CAPITÃO</span></section>` : ''}
    <div id="divisionModal"></div>`;
}

function createTournamentForm(scope = 'division') {
  const divisions = state.home?.divisions || [];
  return `<form class="form-grid" id="createTournamentForm" data-scope-default="${esc(scope)}">
    <label class="full"><span>Nome do torneio</span><input name="name" required maxlength="100" placeholder="Digite o nome do torneio"></label>
    <label class="full"><span>Descrição</span><textarea name="description" maxlength="600" placeholder="Digite uma descrição"></textarea></label>
    <label><span>Data e horário</span><input name="eventAt" type="datetime-local" required></label>
    <label><span>Máximo de participantes</span><input name="maxParticipants" type="number" min="4" max="40" value="16" required></label>
    ${scope === 'admin' ? `<label><span>Tipo</span><select name="scope"><option value="general">Geral</option><option value="division">Divisão</option><option value="special">Especial</option></select></label><label><span>Divisão principal</span><select name="divisionKey"><option value="">Nenhuma</option>${divisions.map((d) => `<option value="${esc(d.key)}">${esc(d.displayName)}</option>`).join('')}</select></label>` : '<input type="hidden" name="scope" value="division">'}
    <label class="full"><span>Premiação</span><textarea name="prizes" placeholder="Digite um prêmio por linha.\nEx.: Cargo de destaque\n100 Rolls\nMenção de honra"></textarea><small>A linha 1 é o prêmio do 1º lugar, a linha 2 do 2º e assim por diante.</small></label>
    <div class="form-actions full"><button type="button" class="secondary-btn" data-action="close-modal">Cancelar</button><button type="submit" class="primary-btn">Criar torneio</button></div>
  </form>`;
}

async function renderProfile(content) {
  const result = await Data.profile();
  state.profile = result.profile || {};
  const p = state.profile;
  content.innerHTML = `
    ${pageHead('PERFIL GAKURAN', 'Seu personagem', 'Os dados ficam ligados à sua conta do Discord e são usados automaticamente nas inscrições.')}
    <section class="panel profile-panel"><div class="panel-head"><div><span>FICHA DO PERSONAGEM</span><h3>Digite seus dados</h3></div><span class="required-note">* obrigatórios</span></div>
      <form class="form-grid" id="profileForm">
        <label class="full"><span>Nome e sobrenome no Gakuran *</span><input name="characterName" value="${esc(p.characterName || '')}" placeholder="Digite nome e sobrenome" required maxlength="48"></label>
        <label><span>Usuário ou ID do Roblox *</span><input name="robloxNick" value="${esc(p.robloxNick || '')}" placeholder="Digite seu usuário" required maxlength="48"></label>
        <label><span>Idade do personagem *</span><input name="age" value="${esc(p.age || '')}" placeholder="Digite a idade" required maxlength="8"></label>
        <label><span>Nacionalidade *</span><input name="nationality" value="${esc(p.nationality || '')}" placeholder="Digite a nacionalidade" required maxlength="32"></label>
        <label><span>Altura *</span><input name="height" value="${esc(p.height || '')}" placeholder="Ex.: 1.79" required maxlength="8"></label>
        <label><span>Estilo do 1º round *</span><input name="fightingStyle1" value="${esc(p.fightingStyle1 || '')}" placeholder="Digite o estilo" required maxlength="40"></label>
        <label><span>Estilo do 2º round</span><input name="fightingStyle2" value="${esc(p.fightingStyle2 || '')}" placeholder="Opcional: deixe vazio para repetir" maxlength="40"></label>
        <div class="form-actions full"><button class="primary-btn" type="submit">Salvar perfil</button></div>
      </form>
    </section>`;
}

async function renderAdmin(content) {
  if (!(state.me.access?.isAdmin || state.me.access?.isFounder)) throw new Error('Acesso administrativo negado.');
  if (!state.home) state.home = await Data.home();
  state.tournaments = await Data.tournaments();
  content.innerHTML = `
    ${pageHead('ADMINISTRAÇÃO', 'Painel geral', 'Crie torneios globais e acompanhe a estrutura da Divina Tokyo.', '<button class="primary-btn" data-action="open-create-admin-tournament">＋ Novo torneio</button>')}
    <section class="stat-grid"><article><span>MEMBROS</span><strong>${Number(state.home.stats?.members || 0)}</strong><small>Discord</small></article><article><span>DIVISÕES</span><strong>${Number(state.home.stats?.divisions || 0)}</strong><small>ativas</small></article><article><span>TORNEIOS</span><strong>${state.tournaments.length}</strong><small>visíveis ao admin</small></article></section>
    <section class="panel"><div class="panel-head"><div><span>GERENCIAMENTO</span><h3>Todos os torneios visíveis</h3></div></div><div class="admin-table">${state.tournaments.map((t) => `<div class="admin-row"><div><strong>${esc(t.name)}</strong><small>${esc(scopeLabel(t))} • ${esc(statusLabel(t))}</small></div><span>${esc(formatDate(t.event_at))}</span><button class="secondary-btn tiny" data-action="open-tournament" data-id="${esc(t.id)}">Gerenciar</button></div>`).join('')}</div></section>
    <div id="adminModal"></div>`;
}

async function renderAccess(content) {
  if (!state.me.access?.isFounder) throw new Error('Somente fundadores podem gerenciar acessos.');
  const result = await Data.admins();
  content.innerHTML = `
    ${pageHead('ACESSOS', 'Administradores do site', 'O login é o Discord. Aqui você libera ou remove poder administrativo sem criar senhas extras.')}
    <section class="split-grid">
      <article class="panel"><div class="panel-head"><div><span>NOVO ADMIN</span><h3>Liberar acesso</h3></div></div><form class="form-grid" id="adminAccessForm"><label class="full"><span>ID do usuário no Discord</span><input name="userId" required placeholder="Digite o ID numérico do Discord"></label><label class="full"><span>Nome para identificação</span><input name="displayName" required maxlength="48" placeholder="Ex.: Thiago"></label><div class="form-actions full"><button class="primary-btn">Adicionar administrador</button></div></form></article>
      <article class="panel"><div class="panel-head"><div><span>ACESSOS ATIVOS</span><h3>Administradores</h3></div></div><div class="member-list">${(result.admins || []).map((a) => `<div class="member-row admin-access-row"><div class="avatar small">${esc((a.displayName || '?').slice(0,1))}</div><div><strong>${esc(a.displayName || a.userId)}</strong><small>${esc(a.userId)}</small></div><button class="danger-text" data-action="remove-admin" data-id="${esc(a.userId)}">Remover</button></div>`).join('')}</div></article>
    </section>
    <section class="security-note"><strong>🔒 Regra de segurança</strong><p>Capitães não entram aqui. Administradores também não criam outros administradores; apenas Fundadores possuem este menu.</p></section>`;
}

async function handleClick(event) {
  const routeBtn = event.target.closest('[data-route]');
  if (routeBtn) { setRoute(routeBtn.dataset.route); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const el = event.target.closest('[data-action]');

  if (action === 'toggle-menu') { state.mobileMenu = !state.mobileMenu; renderShell(); void renderRoute(); return; }
  if (action === 'logout') { setToken(''); state.me = null; renderLanding(); return; }
  if (action === 'open-tournament') { await openTournament(el.dataset.id); return; }
  if (action === 'join-tournament') {
    try { await Data.join(el.dataset.id); showToast('Inscrição confirmada.'); await openTournament(el.dataset.id); } catch (error) { if (error.code === 'PROFILE_REQUIRED') setRoute('profile'); else showToast(error.message, 'error'); } return;
  }
  if (action === 'leave-tournament') { await Data.leave(el.dataset.id); showToast('Inscrição cancelada.'); await openTournament(el.dataset.id); return; }
  if (action === 'toggle-registration') {
    const open = el.dataset.open === '1';
    await Data.updateTournament(el.dataset.id, { registrationOpen: !open });
    showToast(open ? 'Inscrições fechadas.' : 'Inscrições abertas.'); await openTournament(el.dataset.id); return;
  }
  if (action === 'generate-bracket') {
    const players = (state.activeTournament?.entries || []).map(entryToPlayer);
    if (players.length < 4) { showToast('São necessários pelo menos 4 inscritos para gerar a chave.', 'error'); return; }
    if (!confirm('Gerar uma nova chave? Se já houver resultados, eles serão substituídos.')) return;
    try {
      state.activeBracketState = { players, tournament: buildTournament(players), updatedAt: Date.now() };
      await persistBracket();
      showToast('Chave gerada.'); await openTournament(el.dataset.id);
    } catch (error) { showToast(error.message, 'error'); }
    return;
  }
  if (action === 'reset-bracket-results') {
    if (!confirm('Zerar todos os resultados deste torneio?')) return;
    resetResults(state.activeBracketState); await persistBracket(); state.activeRenderer?.render(); showToast('Resultados zerados.'); return;
  }
  if (action === 'open-create-division-tournament') {
    const host = document.getElementById('divisionModal');
    host.innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-x" data-action="close-modal">×</button><p class="eyebrow">TORNEIO INTERNO</p><h3>Criar torneio da ${esc(state.me.division.displayName)}</h3><p>Somente membros desta divisão poderão visualizar e participar.</p>${createTournamentForm('division')}</section></div>`; return;
  }
  if (action === 'open-create-admin-tournament') {
    const host = document.getElementById('adminModal');
    host.innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-x" data-action="close-modal">×</button><p class="eyebrow">ADMINISTRAÇÃO</p><h3>Criar novo torneio</h3>${createTournamentForm('admin')}</section></div>`; return;
  }
  if (action === 'close-modal') { el.closest('.modal-backdrop')?.remove(); return; }
  if (action === 'remove-admin') {
    if (!confirm('Remover este acesso administrativo?')) return;
    await Data.removeAdmin(el.dataset.id); showToast('Acesso removido.'); await renderAccess(document.getElementById('content')); return;
  }
}

async function handleSubmit(event) {
  if (event.target.id === 'profileForm') {
    event.preventDefault(); const fd = new FormData(event.target); const payload = Object.fromEntries(fd.entries());
    try { await Data.saveProfile(payload); showToast('Perfil Gakuran salvo.'); }
    catch (error) { showToast(error.message, 'error'); }
    return;
  }
  if (event.target.id === 'createTournamentForm') {
    event.preventDefault(); const fd = new FormData(event.target);
    const prizes = String(fd.get('prizes') || '').split('\n').map((v) => v.trim()).filter(Boolean).slice(0, 5);
    const scope = String(fd.get('scope') || 'division');
    const payload = {
      name: String(fd.get('name') || '').trim(), description: String(fd.get('description') || '').trim(),
      eventAt: new Date(String(fd.get('eventAt'))).toISOString(), maxParticipants: Number(fd.get('maxParticipants') || 16),
      scope, prizes,
    };
    if (scope === 'division') payload.divisionKey = event.target.dataset.scopeDefault === 'division' ? state.me.division.key : String(fd.get('divisionKey') || '');
    if (scope === 'special') payload.allowedDivisions = String(fd.get('divisionKey') || '').split(',').map((x) => x.trim()).filter(Boolean);
    try {
      const result = await Data.createTournament(payload); showToast('Torneio criado.'); event.target.closest('.modal-backdrop')?.remove();
      if (result?.tournament?.id) await openTournament(result.tournament.id); else setRoute(scope === 'division' ? 'division' : 'admin');
    } catch (error) { showToast(error.message, 'error'); }
    return;
  }
  if (event.target.id === 'adminAccessForm') {
    event.preventDefault(); const fd = new FormData(event.target);
    try { await Data.addAdmin({ userId: String(fd.get('userId')).trim(), displayName: String(fd.get('displayName')).trim() }); showToast('Administrador adicionado.'); await renderAccess(document.getElementById('content')); }
    catch (error) { showToast(error.message, 'error'); }
  }
}

async function init() {
  consumeTokenFromHash();
  app.addEventListener('click', (event) => void handleClick(event));
  app.addEventListener('submit', (event) => void handleSubmit(event));

  if (!state.demo && !getToken()) { renderLanding(); return; }
  try {
    state.me = await Data.me();
    renderShell();
    await renderRoute();
    if (state.demo) showToast(`Modo de demonstração: ${accessLabel(state.me.access)}`);
  } catch (error) {
    setToken('');
    renderLanding();
    showToast(`Sessão inválida: ${error.message}`, 'error');
  }
}

void init();
