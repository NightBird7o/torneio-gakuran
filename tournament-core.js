export const MAX_PLAYERS = 40;
export const MIN_PLAYERS = 4;
export const ROUND_LABELS = {
  16: 'Oitavas de final',
  8: 'Quartas de final',
  4: 'Semifinais',
  2: 'Final'
};

export function createId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultState() {
  return {
    players: [],
    tournament: null,
    registrationOpen: true,
    updatedAt: null
  };
}

export function normalizePlayer(player) {
  if (!player || typeof player !== 'object') return null;
  const fullName = String(player.fullName || player.gakuran || '').trim();
  const styles = Array.isArray(player.styles)
    ? player.styles.map((style) => String(style || '').trim()).filter(Boolean).slice(0, 2)
    : [player.style1, player.style2].map((style) => String(style || '').trim()).filter(Boolean).slice(0, 2);

  return {
    ...player,
    id: player.id || createId('player'),
    fullName,
    gakuran: fullName,
    roblox: String(player.roblox || '').trim(),
    age: String(player.age || '').trim(),
    nationality: String(player.nationality || '').trim(),
    height: String(player.height || '').trim(),
    styles: styles.length ? styles : ['Basic']
  };
}

export function normalizeState(value) {
  if (!value || typeof value !== 'object') return defaultState();
  return {
    players: Array.isArray(value.players) ? value.players.map(normalizePlayer).filter(Boolean) : [],
    tournament: value.tournament && typeof value.tournament === 'object' ? value.tournament : null,
    registrationOpen: value.registrationOpen !== false,
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
  return player?.fullName?.trim() || player?.gakuran?.trim() || player?.roblox?.trim() || 'Jogador sem nome';
}

export function playerStyles(player) {
  const styles = Array.isArray(player?.styles)
    ? player.styles.map((style) => String(style || '').trim()).filter(Boolean).slice(0, 2)
    : [];
  return styles.length ? styles : ['Basic'];
}

export function playerSummary(player) {
  if (!player) return '';
  const parts = [];
  if (player.age) parts.push(`${player.age} anos`);
  if (player.nationality) parts.push(player.nationality);
  if (player.height) parts.push(`${String(player.height).replace(',', '.')} m`);
  return parts.join(' • ');
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sourceForPlayer(player) {
  return { kind: 'player', playerId: player.id };
}

function sourceForWinner(match) {
  return { kind: 'winner', matchId: match.id };
}

function sourceForRank(round, rank) {
  return { kind: 'ranked', roundId: round.id, rank };
}

function makeMatch(a, b, number, prefix = 'match') {
  const match = {
    id: createId(prefix),
    number,
    a: a || null,
    b: b || null,
    rounds: [],
    winnerPlayerId: null,
    autoAdvance: false
  };

  const directA = a?.kind === 'player' ? a.playerId : null;
  const directB = b?.kind === 'player' ? b.playerId : null;
  if (directA && !b) {
    match.winnerPlayerId = directA;
    match.autoAdvance = true;
  } else if (directB && !a) {
    match.winnerPlayerId = directB;
    match.autoAdvance = true;
  }
  return match;
}

function buildRankedEliminationRound(entries, targetCount, label, index) {
  if (entries.length % 2 !== 0) {
    throw new Error('Para que todos lutem na fase eliminatória, a quantidade acima de 16 precisa ser par. Deixe um jogador como reserva ou adicione mais um participante.');
  }

  const matches = [];
  for (let i = 0; i < entries.length; i += 2) {
    matches.push(makeMatch(entries[i], entries[i + 1], i / 2 + 1, `eliminatory-${index}`));
  }

  return {
    id: createId('eliminatory-round'),
    type: 'ranked-elimination',
    label,
    matches,
    enteringCount: entries.length,
    advancingCount: targetCount,
    rankingRule: 'Vencedores primeiro; depois, melhores derrotados por placar de rounds.'
  };
}

function buildHeadToHeadRound(entries, label, index, type = 'elimination') {
  const matches = [];
  for (let i = 0; i < entries.length; i += 2) {
    matches.push(makeMatch(entries[i], entries[i + 1], i / 2 + 1, `phase-${index}`));
  }
  return {
    id: createId('phase-round'),
    type,
    label,
    matches,
    enteringCount: entries.length,
    advancingCount: Math.floor(entries.length / 2)
  };
}

function distributeByes(entries, bracketSize) {
  const slots = Array(bracketSize).fill(null);
  const shuffled = shuffle(entries);
  if (shuffled.length === bracketSize) return shuffled;

  // Espalha os participantes para evitar concentrar todas as folgas no mesmo lado.
  const step = bracketSize / shuffled.length;
  let cursor = 0;
  for (const entry of shuffled) {
    let slot = Math.floor(cursor);
    while (slots[slot]) slot = (slot + 1) % bracketSize;
    slots[slot] = entry;
    cursor += step;
  }
  return slots;
}

function buildMainRounds(entries, bracketSize) {
  const rounds = [];
  let currentSources = distributeByes(entries, bracketSize);
  let participantsEntering = bracketSize;
  let roundIndex = 0;

  while (participantsEntering >= 2) {
    const matches = [];
    const matchCount = participantsEntering / 2;
    for (let i = 0; i < matchCount; i += 1) {
      const a = roundIndex === 0 ? currentSources[i * 2] : sourceForWinner(rounds[roundIndex - 1].matches[i * 2]);
      const b = roundIndex === 0 ? currentSources[i * 2 + 1] : sourceForWinner(rounds[roundIndex - 1].matches[i * 2 + 1]);
      matches.push(makeMatch(a, b, i + 1, `main-${participantsEntering}`));
    }

    rounds.push({
      id: createId('main-round'),
      type: 'main',
      label: ROUND_LABELS[participantsEntering] || `Rodada com ${participantsEntering} jogadores`,
      matches
    });

    participantsEntering /= 2;
    roundIndex += 1;
  }

  return rounds;
}

export function buildTournament(players) {
  const normalizedPlayers = players.map(normalizePlayer).filter(Boolean);
  if (normalizedPlayers.length < MIN_PLAYERS || normalizedPlayers.length > MAX_PLAYERS) {
    throw new Error(`Cadastre entre ${MIN_PLAYERS} e ${MAX_PLAYERS} participantes.`);
  }

  if (normalizedPlayers.length > 16 && normalizedPlayers.length % 2 !== 0) {
    throw new Error('Acima de 16 jogadores, use uma quantidade par para que todos participem da fase eliminatória sem folgas.');
  }

  const playerSources = shuffle(normalizedPlayers).map(sourceForPlayer);
  const qualifiers = [];
  let mainEntries = playerSources;
  let mainBracketSize = 4;
  let entryNote = '';

  if (normalizedPlayers.length > 32) {
    const first = buildRankedEliminationRound(mainEntries, 32, 'Fase eliminatória 1', 1);
    qualifiers.push(first);
    const top32 = Array.from({ length: 32 }, (_, index) => sourceForRank(first, index + 1));
    const finalElimination = buildHeadToHeadRound(top32, 'Fase eliminatória final', 2, 'elimination-final');
    qualifiers.push(finalElimination);
    mainEntries = finalElimination.matches.map(sourceForWinner);
    mainBracketSize = 16;
    entryNote = 'Todos jogam a primeira eliminatória; 32 seguem e depois 16 avançam às oitavas.';
  } else if (normalizedPlayers.length > 16) {
    const elimination = buildRankedEliminationRound(mainEntries, 16, 'Fase eliminatória', 1);
    qualifiers.push(elimination);
    mainEntries = Array.from({ length: 16 }, (_, index) => sourceForRank(elimination, index + 1));
    mainBracketSize = 16;
    entryNote = 'Todos jogam a fase eliminatória; os vencedores e os melhores derrotados pelo placar completam os 16 das oitavas.';
  } else if (normalizedPlayers.length >= 10) {
    mainBracketSize = 16;
    entryNote = 'O torneio começa nas oitavas de final.';
  } else if (normalizedPlayers.length === 9) {
    const shuffled = shuffle(mainEntries);
    const accessMatch = makeMatch(shuffled[0], shuffled[1], 1, 'access');
    const accessRound = {
      id: createId('access-round'),
      type: 'access',
      label: 'Luta de acesso às quartas',
      matches: [accessMatch],
      enteringCount: 2,
      advancingCount: 1
    };
    qualifiers.push(accessRound);
    mainEntries = shuffle([...shuffled.slice(2), sourceForWinner(accessMatch)]);
    mainBracketSize = 8;
    entryNote = 'Com 9 jogadores, uma luta de acesso define os 8 das quartas.';
  } else if (normalizedPlayers.length >= 5) {
    mainBracketSize = 8;
    entryNote = 'O torneio começa nas quartas de final.';
  } else {
    mainBracketSize = 4;
    entryNote = 'O torneio começa nas semifinais.';
  }

  const rounds = buildMainRounds(mainEntries, mainBracketSize);
  const semifinalRound = rounds.find((round) => round.matches.length === 2);
  const thirdPlaceMatch = semifinalRound
    ? {
        ...makeMatch(
          { kind: 'loser', matchId: semifinalRound.matches[0].id },
          { kind: 'loser', matchId: semifinalRound.matches[1].id },
          1,
          'third-place'
        ),
        special: 'third'
      }
    : null;

  return {
    createdAt: new Date().toISOString(),
    playerCount: normalizedPlayers.length,
    mainBracketSize,
    entryNote,
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

export function allRounds(state) {
  if (!state?.tournament) return [];
  return [
    ...(state.tournament.qualifiers || []),
    ...(state.tournament.rounds || [])
  ];
}

export function findMatch(state, matchId) {
  return allMatches(state).find((match) => match.id === matchId) || null;
}

export function findRoundForMatch(state, matchId) {
  const round = allRounds(state).find((candidate) => (candidate.matches || []).some((match) => match.id === matchId));
  if (round) return round;
  if (state?.tournament?.thirdPlaceMatch?.id === matchId) return { id: 'third-place-round', type: 'third' };
  return null;
}

export function findPlayer(state, playerId) {
  return state?.players?.find((player) => player.id === playerId) || null;
}

export function getMatchScore(match) {
  const score = { a: 0, b: 0 };
  for (const round of match?.rounds || []) {
    if (round.winnerSide === 'a') score.a += 1;
    if (round.winnerSide === 'b') score.b += 1;
  }
  return score;
}

function participantStatsForRankedRound(state, round) {
  const stats = [];
  for (const match of round.matches || []) {
    if (!match.winnerPlayerId) return [];
    const participantA = resolveSource(state, match.a);
    const participantB = resolveSource(state, match.b);
    if (!participantA || !participantB) return [];
    const score = getMatchScore(match);
    const winnerIsA = match.winnerPlayerId === participantA.id;
    const add = (player, wonMatch, roundsWon, roundsLost, seedOrder) => {
      stats.push({
        player,
        wonMatch,
        roundsWon,
        roundsLost,
        roundDiff: roundsWon - roundsLost,
        seedOrder
      });
    };
    add(participantA, winnerIsA, score.a, score.b, stats.length);
    add(participantB, !winnerIsA, score.b, score.a, stats.length);
  }

  return stats.sort((left, right) => {
    if (left.wonMatch !== right.wonMatch) return left.wonMatch ? -1 : 1;
    if (left.roundDiff !== right.roundDiff) return right.roundDiff - left.roundDiff;
    if (left.roundsWon !== right.roundsWon) return right.roundsWon - left.roundsWon;
    return left.seedOrder - right.seedOrder;
  });
}

export function rankedPlayersForRound(state, roundId) {
  const round = (state?.tournament?.qualifiers || []).find((candidate) => candidate.id === roundId);
  if (!round || round.type !== 'ranked-elimination') return [];
  return participantStatsForRankedRound(state, round).map((entry) => entry.player);
}

export function resolveSource(state, source) {
  if (!source) return null;
  if (source.kind === 'player') return findPlayer(state, source.playerId);

  if (source.kind === 'ranked') {
    const ranked = rankedPlayersForRound(state, source.roundId);
    return ranked[source.rank - 1] || null;
  }

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
  if (source?.kind === 'ranked') return `Classificado #${source.rank} da fase eliminatória`;
  return 'Folga / a definir';
}

function roundUsesSource(round, matchId, roundId) {
  return (round.matches || []).some((match) => [match.a, match.b].some((source) => {
    if (!source) return false;
    if (['winner', 'loser'].includes(source.kind) && source.matchId === matchId) return true;
    if (source.kind === 'ranked' && source.roundId === roundId) return true;
    return false;
  }));
}

export function invalidateDependents(state, matchId) {
  const changedRound = findRoundForMatch(state, matchId);
  const changedRoundId = changedRound?.id || null;

  for (const round of allRounds(state)) {
    if (!roundUsesSource(round, matchId, changedRoundId)) continue;
    for (const match of round.matches || []) {
      const depends = [match.a, match.b].some((source) => {
        if (!source) return false;
        if (['winner', 'loser'].includes(source.kind) && source.matchId === matchId) return true;
        if (source.kind === 'ranked' && source.roundId === changedRoundId) return true;
        return false;
      });
      if (depends) {
        const hadData = match.rounds?.length || match.winnerPlayerId;
        match.rounds = [];
        match.winnerPlayerId = null;
        match.autoAdvance = false;
        if (hadData) invalidateDependents(state, match.id);
      }
    }
  }

  const third = state?.tournament?.thirdPlaceMatch;
  if (third) {
    const depends = [third.a, third.b].some((source) => source && ['winner', 'loser'].includes(source.kind) && source.matchId === matchId);
    if (depends) {
      third.rounds = [];
      third.winnerPlayerId = null;
    }
  }
}

export function styleForRound(player, roundNumber, tiebreakChoice = '') {
  const styles = playerStyles(player);
  if (roundNumber === 1) return styles[0];
  if (roundNumber === 2) return styles[1] || styles[0];
  return styles.includes(tiebreakChoice) ? tiebreakChoice : styles[0];
}

export function recordPoint(state, matchId, playerId, tiebreakChoices = {}) {
  const match = findMatch(state, matchId);
  if (!match || match.autoAdvance || match.winnerPlayerId) return false;

  const participantA = resolveSource(state, match.a);
  const participantB = resolveSource(state, match.b);
  if (!participantA || !participantB) return false;
  if (![participantA.id, participantB.id].includes(playerId)) return false;

  const existingRounds = Array.isArray(match.rounds) ? match.rounds : [];
  if (existingRounds.length >= 3) return false;
  const scoreBefore = getMatchScore(match);
  if (existingRounds.length === 2 && !(scoreBefore.a === 1 && scoreBefore.b === 1)) return false;

  const roundNumber = existingRounds.length + 1;
  const winnerSide = participantA.id === playerId ? 'a' : 'b';
  const styleA = styleForRound(participantA, roundNumber, tiebreakChoices[participantA.id]);
  const styleB = styleForRound(participantB, roundNumber, tiebreakChoices[participantB.id]);

  match.rounds = [
    ...existingRounds,
    {
      number: roundNumber,
      winnerPlayerId: playerId,
      winnerSide,
      styles: {
        [participantA.id]: styleA,
        [participantB.id]: styleB
      }
    }
  ];

  const scoreAfter = getMatchScore(match);
  if (scoreAfter.a === 2 || scoreAfter.b === 2) {
    match.winnerPlayerId = scoreAfter.a === 2 ? participantA.id : participantB.id;
  }
  return true;
}

export function undoLastPoint(state, matchId) {
  const match = findMatch(state, matchId);
  if (!match || match.autoAdvance || !match.rounds?.length) return false;
  if (match.winnerPlayerId) invalidateDependents(state, match.id);
  match.rounds = match.rounds.slice(0, -1);
  match.winnerPlayerId = null;
  return true;
}

export function resetResults(state) {
  for (const match of allMatches(state)) {
    if (match.autoAdvance) continue;
    match.rounds = [];
    match.winnerPlayerId = null;
  }
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
