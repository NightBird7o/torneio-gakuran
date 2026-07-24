export const MAX_PLAYERS = 40;
export const MIN_PLAYERS = 20;
export const MAIN_BRACKET_SIZE = 16;

export function createId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultState() {
  return { players: [], tournament: null };
}

export function normalizeState(value) {
  if (!value || typeof value !== 'object') return defaultState();
  return {
    players: Array.isArray(value.players) ? value.players.filter(Boolean) : [],
    tournament: value.tournament && typeof value.tournament === 'object' ? value.tournament : null,
    updatedAt: value.updatedAt ?? null
  };
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function playerLabel(player) {
  return player?.gakuran?.trim() || player?.roblox?.trim() || 'Jogador sem nome';
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeMatch(a, b, number, prefix = 'match') {
  return {
    id: createId(prefix),
    number,
    a,
    b,
    winnerPlayerId: null
  };
}

function playerSources(players) {
  return players.map((player) => ({ kind: 'player', playerId: player.id }));
}

/**
 * Reduz uma lista de entradas para o tamanho-alvo por meio de uma fase com
 * confrontos e folgas. O número de lutas é n - alvo; as demais entradas
 * avançam diretamente. Isso mantém a chave equilibrada sem inventar jogadores.
 */
function buildReductionRound(entries, targetCount, label, roundIndex) {
  const matchCount = entries.length - targetCount;
  const playerCountInMatches = matchCount * 2;
  const shuffledEntries = shuffle(entries);
  const fightingEntries = shuffledEntries.slice(0, playerCountInMatches);
  const byeEntries = shuffledEntries.slice(playerCountInMatches);
  const matches = [];

  for (let i = 0; i < fightingEntries.length; i += 2) {
    matches.push(makeMatch(fightingEntries[i], fightingEntries[i + 1], i / 2 + 1, `qualifier-${roundIndex}`));
  }

  const nextEntries = shuffle([
    ...byeEntries,
    ...matches.map((match) => ({ kind: 'winner', matchId: match.id }))
  ]);

  return {
    round: {
      id: createId('qualifier-round'),
      label,
      matches,
      byeCount: byeEntries.length,
      enteringCount: entries.length,
      advancingCount: targetCount
    },
    nextEntries
  };
}

export function buildTournament(players) {
  if (!Array.isArray(players) || players.length < MAIN_BRACKET_SIZE) {
    throw new Error('Quantidade insuficiente para criar a chave.');
  }

  const shuffledPlayers = shuffle(players);
  const qualifiers = [];
  let entries = playerSources(shuffledPlayers);
  let qualifierIndex = 1;

  if (entries.length > 32) {
    const result = buildReductionRound(entries, 32, 'Classificatória 1', qualifierIndex);
    qualifiers.push(result.round);
    entries = result.nextEntries;
    qualifierIndex += 1;
  }

  if (entries.length > MAIN_BRACKET_SIZE) {
    const label = qualifiers.length ? 'Classificatória final' : 'Classificatória';
    const result = buildReductionRound(entries, MAIN_BRACKET_SIZE, label, qualifierIndex);
    qualifiers.push(result.round);
    entries = result.nextEntries;
  }

  const rounds = [];
  let participantsEntering = MAIN_BRACKET_SIZE;
  let currentEntries = entries;
  let previousMatches = null;

  const labels = {
    16: 'Oitavas de final',
    8: 'Quartas de final',
    4: 'Semifinais',
    2: 'Final'
  };

  while (participantsEntering >= 2) {
    const matchCount = participantsEntering / 2;
    const matches = [];

    for (let i = 0; i < matchCount; i += 1) {
      const a = previousMatches
        ? { kind: 'winner', matchId: previousMatches[i * 2].id }
        : currentEntries[i * 2];
      const b = previousMatches
        ? { kind: 'winner', matchId: previousMatches[i * 2 + 1].id }
        : currentEntries[i * 2 + 1];
      matches.push(makeMatch(a, b, i + 1));
    }

    rounds.push({
      id: createId('round'),
      label: labels[participantsEntering] || `Rodada com ${participantsEntering}`,
      matches
    });

    previousMatches = matches;
    participantsEntering /= 2;
  }

  const semifinalRound = rounds.find((round) => round.matches.length === 2);
  const thirdPlaceMatch = semifinalRound
    ? {
        ...makeMatch(
          { kind: 'loser', matchId: semifinalRound.matches[0].id },
          { kind: 'loser', matchId: semifinalRound.matches[1].id },
          1,
          'third'
        ),
        special: 'third'
      }
    : null;

  return {
    createdAt: new Date().toISOString(),
    playerCount: players.length,
    mainBracketSize: MAIN_BRACKET_SIZE,
    qualifiers,
    rounds,
    thirdPlaceMatch
  };
}

export function allMatches(state) {
  if (!state?.tournament) return [];
  const qualifiers = Array.isArray(state.tournament.qualifiers)
    ? state.tournament.qualifiers.flatMap((round) => round.matches || [])
    : [];
  const main = Array.isArray(state.tournament.rounds)
    ? state.tournament.rounds.flatMap((round) => round.matches || [])
    : [];
  const matches = [...qualifiers, ...main];
  if (state.tournament.thirdPlaceMatch) matches.push(state.tournament.thirdPlaceMatch);
  return matches;
}

export function findMatch(state, matchId) {
  return allMatches(state).find((match) => match.id === matchId) || null;
}

export function findPlayer(state, playerId) {
  return state?.players?.find((player) => player.id === playerId) || null;
}

export function resolveSource(state, source) {
  if (!source) return null;
  if (source.kind === 'player') return findPlayer(state, source.playerId);

  const sourceMatch = findMatch(state, source.matchId);
  if (!sourceMatch) return null;

  if (source.kind === 'winner') {
    return sourceMatch.winnerPlayerId ? findPlayer(state, sourceMatch.winnerPlayerId) : null;
  }

  if (source.kind === 'loser') {
    if (!sourceMatch.winnerPlayerId) return null;
    const participantA = resolveSource(state, sourceMatch.a);
    const participantB = resolveSource(state, sourceMatch.b);
    if (!participantA || !participantB) return null;
    return participantA.id === sourceMatch.winnerPlayerId ? participantB : participantA;
  }

  return null;
}

export function sourcePendingLabel(source) {
  if (source?.kind === 'winner') return 'Vencedor da luta anterior';
  if (source?.kind === 'loser') return 'Perdedor da semifinal';
  return 'A definir';
}

export function invalidateDependents(state, matchId) {
  for (const match of allMatches(state)) {
    const depends = [match.a, match.b].some(
      (source) => source && ['winner', 'loser'].includes(source.kind) && source.matchId === matchId
    );
    if (depends) {
      const hadWinner = Boolean(match.winnerPlayerId);
      match.winnerPlayerId = null;
      if (hadWinner || match.id !== matchId) invalidateDependents(state, match.id);
    }
  }
}

export function chooseWinner(state, matchId, playerId) {
  const match = findMatch(state, matchId);
  if (!match) return false;

  const participantA = resolveSource(state, match.a);
  const participantB = resolveSource(state, match.b);
  if (![participantA?.id, participantB?.id].includes(playerId)) return false;

  if (match.winnerPlayerId === playerId) return false;
  invalidateDependents(state, match.id);
  match.winnerPlayerId = playerId;
  return true;
}

export function resetResults(state) {
  for (const match of allMatches(state)) match.winnerPlayerId = null;
}

export function standings(state) {
  if (!state?.tournament) return { champion: null, runnerUp: null, third: null };

  const finalRound = state.tournament.rounds?.[state.tournament.rounds.length - 1];
  const finalMatch = finalRound?.matches?.[0] || null;
  const finalistA = finalMatch ? resolveSource(state, finalMatch.a) : null;
  const finalistB = finalMatch ? resolveSource(state, finalMatch.b) : null;
  const champion = finalMatch?.winnerPlayerId ? findPlayer(state, finalMatch.winnerPlayerId) : null;
  let runnerUp = null;

  if (champion && finalistA && finalistB) {
    runnerUp = finalistA.id === champion.id ? finalistB : finalistA;
  }

  const thirdMatch = state.tournament.thirdPlaceMatch;
  const third = thirdMatch?.winnerPlayerId ? findPlayer(state, thirdMatch.winnerPlayerId) : null;
  return { champion, runnerUp, third };
}
