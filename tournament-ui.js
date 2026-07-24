import {
  allMatches,
  escapeHtml,
  playerLabel,
  resolveSource,
  sourcePendingLabel,
  standings
} from './tournament-core.js';

export function formatTimestamp(value) {
  if (!value) return 'Aguardando primeira atualização';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return 'Atualização recente';
  return `Atualizado em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`;
}

export function createTournamentRenderer({
  getState,
  canEdit = () => false,
  onChooseWinner = () => {},
  elements
}) {
  let drawTimer = null;

  const {
    qualifierPanel,
    qualifierRounds,
    bracketEmpty,
    bracketStage,
    bracketScroll,
    bracketSummary,
    firstPlace,
    secondPlace,
    thirdPlace
  } = elements;

  function competitorHtml(state, match, participant, source, participantA, participantB) {
    const isWinner = participant && participant.id === match.winnerPlayerId;
    const label = participant ? playerLabel(participant) : sourcePendingLabel(source);
    const disabled = !participant || !participantA || !participantB;

    const action = canEdit()
      ? `<button class="advance-btn" type="button" data-match-id="${match.id}" data-player-id="${participant?.id || ''}" ${disabled ? 'disabled' : ''}>
          ${isWinner ? '✓ Classificado' : 'Avançar'}
        </button>`
      : `<span class="result-badge" title="${isWinner ? 'Vencedor da luta' : 'Aguardando resultado'}">${isWinner ? '✓' : '—'}</span>`;

    return `
      <div class="competitor${isWinner ? ' winner' : ''}">
        <span class="competitor-name${participant ? '' : ' pending'}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        ${action}
      </div>
    `;
  }

  function matchHtml(state, match, index, options = {}) {
    const participantA = resolveSource(state, match.a);
    const participantB = resolveSource(state, match.b);
    const decided = Boolean(match.winnerPlayerId);
    const cardClass = [
      'match-card',
      decided ? 'decided' : '',
      options.final ? 'final-card' : '',
      options.third ? 'third-card' : ''
    ].filter(Boolean).join(' ');

    return `
      <article class="${cardClass}" data-match-card-id="${match.id}">
        <div class="match-meta"><span>Luta ${index + 1}</span><span>${decided ? 'Encerrada' : 'Aguardando'}</span></div>
        ${competitorHtml(state, match, participantA, match.a, participantA, participantB)}
        ${competitorHtml(state, match, participantB, match.b, participantA, participantB)}
      </article>
    `;
  }

  function renderQualifiers(state) {
    const qualifiers = state.tournament?.qualifiers || [];
    if (!qualifiers.length) {
      qualifierPanel.hidden = true;
      qualifierRounds.innerHTML = '';
      return;
    }

    qualifierPanel.hidden = false;
    qualifierRounds.innerHTML = qualifiers.map((round) => `
      <section class="qualifier-round">
        <h3 class="qualifier-title">${escapeHtml(round.label)}</h3>
        <div class="qualifier-grid">
          ${(round.matches || []).map((match, index) => matchHtml(state, match, index)).join('')}
        </div>
        <p class="qualifier-note">
          ${round.enteringCount} jogadores nesta etapa • ${round.matches.length} lutas • ${round.byeCount || 0} avançam diretamente • ${round.advancingCount} seguem para a próxima fase
        </p>
      </section>
    `).join('');
  }

  function renderStandings(state) {
    const result = standings(state);
    firstPlace.textContent = result.champion ? playerLabel(result.champion) : 'A definir';
    secondPlace.textContent = result.runnerUp ? playerLabel(result.runnerUp) : 'A definir';
    thirdPlace.textContent = result.third ? playerLabel(result.third) : 'A definir';
  }

  function render() {
    const state = getState();
    if (!state?.tournament) {
      qualifierPanel.hidden = true;
      bracketEmpty.hidden = false;
      bracketStage.hidden = true;
      bracketStage.innerHTML = '<svg class="connections" id="connections" aria-hidden="true"></svg>';
      bracketSummary.textContent = 'A tabela ainda não foi criada pelo administrador.';
      renderStandings(state);
      return;
    }

    renderQualifiers(state);

    const tournament = state.tournament;
    const rounds = tournament.rounds || [];
    const baseMatches = Math.max(1, ...rounds.map((round) => round.matches?.length || 0));
    const roundHeight = Math.max(520, baseMatches * 108);
    const finalRoundIndex = rounds.length - 1;

    const columns = rounds.map((round, roundIndex) => {
      const isFinalRound = roundIndex === finalRoundIndex;
      if (isFinalRound && tournament.thirdPlaceMatch) {
        return `
          <section class="round-column" data-round-id="${round.id}" style="--round-height:${roundHeight}px">
            <h3 class="round-title">Decisões</h3>
            <div class="final-stack">
              <div>
                <div class="special-label">Grande final</div>
                ${matchHtml(state, round.matches[0], 0, { final: true })}
              </div>
              <div>
                <div class="special-label">Disputa de 3º lugar</div>
                ${matchHtml(state, tournament.thirdPlaceMatch, 0, { third: true })}
              </div>
            </div>
          </section>
        `;
      }

      return `
        <section class="round-column" data-round-id="${round.id}" style="--round-height:${roundHeight}px">
          <h3 class="round-title">${escapeHtml(round.label)}</h3>
          <div class="round-matches">
            ${(round.matches || []).map((match, index) => matchHtml(state, match, index)).join('')}
          </div>
        </section>
      `;
    }).join('');

    bracketStage.hidden = false;
    bracketEmpty.hidden = true;
    bracketStage.innerHTML = `<svg class="connections" id="connections" aria-hidden="true"></svg>${columns}`;

    const qualifierCount = tournament.qualifiers?.length || 0;
    bracketSummary.textContent = `${tournament.playerCount} participantes • tabela principal das oitavas à final${qualifierCount ? ` • ${qualifierCount} etapa${qualifierCount > 1 ? 's' : ''} classificatória${qualifierCount > 1 ? 's' : ''}` : ''}`;
    renderStandings(state);
    scheduleDrawConnections();
  }

  function scheduleDrawConnections() {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(drawConnections, 70);
  }

  function drawConnections() {
    const state = getState();
    if (!state?.tournament || bracketStage.hidden) return;
    const svg = bracketStage.querySelector('#connections');
    if (!svg) return;

    const stageRect = bracketStage.getBoundingClientRect();
    const width = bracketStage.scrollWidth;
    const height = bracketStage.scrollHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    const mainMatchIds = new Set((state.tournament.rounds || []).flatMap((round) => (round.matches || []).map((match) => match.id)));
    if (state.tournament.thirdPlaceMatch) mainMatchIds.add(state.tournament.thirdPlaceMatch.id);

    const paths = [];
    for (const targetMatch of allMatches(state)) {
      if (!mainMatchIds.has(targetMatch.id)) continue;
      for (const source of [targetMatch.a, targetMatch.b]) {
        if (!source || !['winner', 'loser'].includes(source.kind) || !mainMatchIds.has(source.matchId)) continue;
        const sourceEl = bracketStage.querySelector(`[data-match-card-id="${source.matchId}"]`);
        const targetEl = bracketStage.querySelector(`[data-match-card-id="${targetMatch.id}"]`);
        if (!sourceEl || !targetEl) continue;

        const from = sourceEl.getBoundingClientRect();
        const to = targetEl.getBoundingClientRect();
        const x1 = from.right - stageRect.left;
        const y1 = from.top - stageRect.top + from.height / 2;
        const x2 = to.left - stageRect.left;
        const y2 = to.top - stageRect.top + to.height / 2;
        const midX = x1 + (x2 - x1) / 2;
        const dash = source.kind === 'loser' ? '6 5' : '';
        paths.push(`<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" fill="none" stroke="rgba(173,190,219,.48)" stroke-width="2" stroke-dasharray="${dash}" />`);
      }
    }

    svg.innerHTML = paths.join('');
  }

  function handleClick(event) {
    const button = event.target.closest('.advance-btn');
    if (!button || button.disabled || !canEdit()) return;
    onChooseWinner(button.dataset.matchId, button.dataset.playerId);
  }

  qualifierRounds.addEventListener('click', handleClick);
  bracketStage.addEventListener('click', handleClick);
  window.addEventListener('resize', scheduleDrawConnections);
  bracketScroll.addEventListener('scroll', scheduleDrawConnections, { passive: true });

  return { render, scheduleDrawConnections };
}
