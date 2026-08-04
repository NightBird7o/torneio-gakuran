import {
  allMatches,
  escapeHtml,
  getMatchScore,
  playerLabel,
  playerStyles,
  playerSummary,
  rankedPlayersForRound,
  resolveSource,
  sourcePendingLabel,
  standings,
  styleForRound
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

function stylesText(player) {
  return playerStyles(player).join(' + ');
}

export function createTournamentRenderer({
  getState,
  canEdit = () => false,
  onRecordPoint = () => {},
  onUndoPoint = () => {},
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

  function scoreButton(match, player, participantA, participantB) {
    if (!canEdit()) return '';
    const disabled = !player || !participantA || !participantB || match.winnerPlayerId || match.autoAdvance;
    return `<button class="point-btn" type="button" data-action="point" data-match-id="${escapeHtml(match.id)}" data-player-id="${escapeHtml(player?.id || '')}" ${disabled ? 'disabled' : ''}>＋ ponto</button>`;
  }

  function competitorHtml(match, participant, side, participantA, participantB) {
    const label = participant ? playerLabel(participant) : sourcePendingLabel(side === 'a' ? match.a : match.b);
    const summary = participant ? playerSummary(participant) : '';
    const isWinner = participant && participant.id === match.winnerPlayerId;
    const score = getMatchScore(match)[side];

    return `
      <div class="fighter-row${isWinner ? ' fighter-winner' : ''}">
        <div class="fighter-copy">
          <strong class="fighter-name${participant ? '' : ' pending'}" title="${escapeHtml(label)}">${escapeHtml(label)}</strong>
          ${participant ? `<span class="fighter-meta">${escapeHtml(stylesText(participant))}${summary ? ` • ${escapeHtml(summary)}` : ''}</span>` : ''}
        </div>
        <div class="fighter-score">${score}</div>
        ${scoreButton(match, participant, participantA, participantB)}
      </div>
    `;
  }

  function tiebreakControls(match, participantA, participantB) {
    if (!canEdit() || match.winnerPlayerId || match.autoAdvance || !participantA || !participantB) return '';
    const score = getMatchScore(match);
    if (!(score.a === 1 && score.b === 1 && (match.rounds || []).length === 2)) return '';

    const selectFor = (player) => {
      const styles = playerStyles(player);
      if (styles.length < 2) {
        return `<span class="locked-style">${escapeHtml(styles[0])}</span>`;
      }
      return `
        <select class="tiebreak-style" data-player-id="${escapeHtml(player.id)}" aria-label="Estilo de desempate de ${escapeHtml(playerLabel(player))}">
          ${styles.map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`).join('')}
        </select>
      `;
    };

    return `
      <div class="tiebreak-box">
        <span>Round 3 — escolha os estilos</span>
        <div class="tiebreak-grid">
          <label>${escapeHtml(playerLabel(participantA))}${selectFor(participantA)}</label>
          <label>${escapeHtml(playerLabel(participantB))}${selectFor(participantB)}</label>
        </div>
      </div>
    `;
  }

  function roundHistory(match, participantA, participantB) {
    const rounds = match.rounds || [];
    if (!rounds.length) {
      return '<div class="round-history empty">Aguardando o primeiro round</div>';
    }

    return `
      <div class="round-history">
        ${rounds.map((round) => {
          const winner = round.winnerPlayerId === participantA?.id ? participantA : participantB;
          const styleA = participantA ? round.styles?.[participantA.id] || styleForRound(participantA, round.number) : '—';
          const styleB = participantB ? round.styles?.[participantB.id] || styleForRound(participantB, round.number) : '—';
          return `
            <div class="round-chip">
              <span>R${round.number}</span>
              <strong>${escapeHtml(winner ? playerLabel(winner) : 'A definir')}</strong>
              <small>${escapeHtml(styleA)} × ${escapeHtml(styleB)}</small>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function matchHtml(state, match, index, options = {}) {
    const participantA = resolveSource(state, match.a);
    const participantB = resolveSource(state, match.b);
    const score = getMatchScore(match);
    const decided = Boolean(match.winnerPlayerId);
    const status = match.autoAdvance
      ? 'Folga técnica'
      : decided
        ? `${score.a} × ${score.b} • encerrada`
        : `${score.a} × ${score.b} • em disputa`;
    const cardClass = [
      'match-card',
      decided ? 'decided' : '',
      match.autoAdvance ? 'auto-advance' : '',
      options.final ? 'final-card' : '',
      options.third ? 'third-card' : ''
    ].filter(Boolean).join(' ');

    return `
      <article class="${cardClass}" data-match-card-id="${escapeHtml(match.id)}">
        <div class="match-meta">
          <span>${options.groupLabel || `Grupo ${index + 1}`}</span>
          <span>${escapeHtml(status)}</span>
        </div>
        <div class="mini-scoreboard">
          ${competitorHtml(match, participantA, 'a', participantA, participantB)}
          <div class="score-divider">VS</div>
          ${competitorHtml(match, participantB, 'b', participantA, participantB)}
        </div>
        ${roundHistory(match, participantA, participantB)}
        ${tiebreakControls(match, participantA, participantB)}
        ${canEdit() && !match.autoAdvance && (match.rounds || []).length
          ? `<button class="undo-round-btn" type="button" data-action="undo" data-match-id="${escapeHtml(match.id)}">↶ desfazer último round</button>`
          : ''}
        ${match.autoAdvance ? '<div class="auto-note">Um jogador avançou automaticamente porque esta fase possui uma folga.</div>' : ''}
      </article>
    `;
  }

  function renderQualifierRanking(state, round) {
    if (round.type !== 'ranked-elimination') return '';
    const ranked = rankedPlayersForRound(state, round.id);
    if (!ranked.length) {
      return '<p class="qualifier-note">A classificação aparece quando todos os grupos desta fase terminarem.</p>';
    }
    const selected = ranked.slice(0, round.advancingCount);
    return `
      <div class="qualified-strip">
        <strong>Classificados:</strong>
        ${selected.map((player, index) => `<span>${index + 1}. ${escapeHtml(playerLabel(player))}</span>`).join('')}
      </div>
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
        <div class="qualifier-heading">
          <h3 class="qualifier-title">${escapeHtml(round.label)}</h3>
          <span>${round.enteringCount || (round.matches?.length || 0) * 2} jogadores • ${round.matches?.length || 0} grupos</span>
        </div>
        <div class="qualifier-grid">
          ${(round.matches || []).map((match, index) => matchHtml(state, match, index)).join('')}
        </div>
        <p class="qualifier-note">
          ${round.advancingCount ? `${round.advancingCount} seguem para a próxima fase.` : ''}
          ${round.rankingRule ? ` ${escapeHtml(round.rankingRule)}` : ''}
        </p>
        ${renderQualifierRanking(state, round)}
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
    const roundHeight = Math.max(690, baseMatches * 260);
    const finalRoundIndex = rounds.length - 1;

    const columns = rounds.map((round, roundIndex) => {
      const isFinalRound = roundIndex === finalRoundIndex;
      if (isFinalRound && tournament.thirdPlaceMatch) {
        return `
          <section class="round-column" data-round-id="${escapeHtml(round.id)}" style="--round-height:${roundHeight}px">
            <h3 class="round-title">Decisões</h3>
            <div class="final-stack">
              <div>
                <div class="special-label">Grande final</div>
                ${matchHtml(state, round.matches[0], 0, { final: true, groupLabel: 'Final' })}
              </div>
              <div>
                <div class="special-label">Disputa de 3º lugar</div>
                ${matchHtml(state, tournament.thirdPlaceMatch, 0, { third: true, groupLabel: '3º lugar' })}
              </div>
            </div>
          </section>
        `;
      }

      return `
        <section class="round-column" data-round-id="${escapeHtml(round.id)}" style="--round-height:${roundHeight}px">
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
    bracketSummary.textContent = `${tournament.playerCount} participantes • ${tournament.entryNote || ''}${qualifierCount ? ` • ${qualifierCount} etapa${qualifierCount > 1 ? 's' : ''} antes da chave principal` : ''}`;
    renderStandings(state);
    scheduleDrawConnections();
  }

  function scheduleDrawConnections() {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(drawConnections, 80);
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
        const dash = source.kind === 'loser' ? '7 5' : '';
        paths.push(`<path d="M ${x1} ${y1} H ${midX} V ${y2} H ${x2}" fill="none" stroke="rgba(214,169,58,.46)" stroke-width="2" stroke-dasharray="${dash}" />`);
      }
    }

    svg.innerHTML = paths.join('');
  }

  function handleClick(event) {
    if (!canEdit()) return;
    const pointButton = event.target.closest('[data-action="point"]');
    if (pointButton && !pointButton.disabled) {
      const card = pointButton.closest('[data-match-card-id]');
      const choices = {};
      card?.querySelectorAll('.tiebreak-style').forEach((select) => {
        choices[select.dataset.playerId] = select.value;
      });
      onRecordPoint(pointButton.dataset.matchId, pointButton.dataset.playerId, choices);
      return;
    }

    const undoButton = event.target.closest('[data-action="undo"]');
    if (undoButton) onUndoPoint(undoButton.dataset.matchId);
  }

  qualifierRounds.addEventListener('click', handleClick);
  bracketStage.addEventListener('click', handleClick);
  window.addEventListener('resize', scheduleDrawConnections);
  bracketScroll.addEventListener('scroll', scheduleDrawConnections, { passive: true });

  return { render, scheduleDrawConnections };
}
