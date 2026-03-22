import type { MatchLite } from '../types/api'

type RotationGame = {
  pitch: string | number
  A: string
  B: string
}

type RotationSlot<TGame extends RotationGame = RotationGame> = {
  time: string
  games: TGame[]
}

export type LinkedRotationGame = RotationGame & {
  isClubGame: boolean
  opponent: string
  linkedMatch: MatchLite | null
}

export type LinkedRotationSlot = RotationSlot<LinkedRotationGame>

function normalizeToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function buildGameKeyCandidates(time: string, pitch: string | number, teamA: string, teamB: string) {
  const a = normalizeToken(teamA)
  const b = normalizeToken(teamB)
  const t = normalizeToken(time)
  const p = normalizeToken(pitch)
  const raw = [
    `${t}-${p}-${a}-${b}`,
    `${t}-${p}-${b}-${a}`,
    `${t}|${p}|${a}|${b}`,
    `${t}|${p}|${b}|${a}`,
    `${t}:${p}:${a}:${b}`,
    `${t}:${p}:${b}:${a}`,
  ]
  return Array.from(new Set(raw))
}

function buildRotationKeyCandidates(rotationGameKey: string) {
  const raw = normalizeToken(rotationGameKey)
  if (!raw) return [] as string[]
  const list = [raw]
  const idx = raw.indexOf(':')
  if (idx > -1 && idx < raw.length - 1) {
    list.push(raw.slice(idx + 1))
  }
  return Array.from(new Set(list))
}

export function linkRotationSlotsToMatches(params: {
  slots: RotationSlot[]
  matches: MatchLite[]
  clubPlanningTeam: string
}) {
  const { slots, matches, clubPlanningTeam } = params
  const sortedMatches = matches
    .slice()
    .sort((a, b) => {
      const da = new Date(a.createdAt).getTime()
      const db = new Date(b.createdAt).getTime()
      if (da !== db) return da - db
      return a.id.localeCompare(b.id)
    })

  const keyedMatches = new Map<string, MatchLite[]>()
  for (const match of sortedMatches) {
    const key = typeof match.rotationGameKey === 'string' ? match.rotationGameKey.trim() : ''
    if (!key) continue
    for (const candidate of buildRotationKeyCandidates(key)) {
      if (!keyedMatches.has(candidate)) keyedMatches.set(candidate, [])
      keyedMatches.get(candidate)?.push(match)
    }
  }

  const linkedSlots: LinkedRotationSlot[] = slots.map((slot) => ({
    ...slot,
    games: slot.games.map((game) => {
      const isClubGame = Boolean(clubPlanningTeam) && (game.A === clubPlanningTeam || game.B === clubPlanningTeam)
      const opponent = isClubGame ? (game.A === clubPlanningTeam ? game.B : game.A) : ''
      return { ...game, isClubGame, opponent, linkedMatch: null }
    }),
  }))

  const allClubGames = linkedSlots.flatMap((slot) => slot.games.filter((game) => game.isClubGame).map((game) => ({
    slotTime: slot.time,
    game,
  })))

  const usedMatchIds = new Set<string>()

  // Pass 1: direct key-based join. Prefixes (legacy:/schedule:/future) are accepted.
  for (const item of allClubGames) {
    const { game, slotTime } = item
    const candidates = buildGameKeyCandidates(slotTime, game.pitch, game.A, game.B)
    let linked: MatchLite | null = null
    for (const candidate of candidates) {
      const list = keyedMatches.get(candidate) || []
      linked = list.find((match) => !usedMatchIds.has(match.id)) || null
      if (linked) break
    }
    if (!linked) continue
    game.linkedMatch = linked
    usedMatchIds.add(linked.id)
  }

  // Pass 2: opponent/occurrence fallback for remaining club games.
  const matchesByOpponent = new Map<string, MatchLite[]>()
  for (const match of sortedMatches) {
    if (usedMatchIds.has(match.id)) continue
    const opponent = normalizeToken(match.opponentName || '')
    if (!opponent) continue
    if (!matchesByOpponent.has(opponent)) matchesByOpponent.set(opponent, [])
    matchesByOpponent.get(opponent)?.push(match)
  }
  const opponentSeenCount = new Map<string, number>()
  for (const item of allClubGames) {
    const { game } = item
    if (game.linkedMatch) continue
    const opponentKey = normalizeToken(game.opponent)
    if (!opponentKey) continue
    const occurrence = opponentSeenCount.get(opponentKey) ?? 0
    opponentSeenCount.set(opponentKey, occurrence + 1)
    const linked = matchesByOpponent.get(opponentKey)?.[occurrence] ?? null
    if (!linked || usedMatchIds.has(linked.id)) continue
    game.linkedMatch = linked
    usedMatchIds.add(linked.id)
  }

  // Pass 3 (fail-open): if nothing matched while matches exist, assign by chronological order.
  const matchedCount = allClubGames.filter((item) => Boolean(item.game.linkedMatch)).length
  if (matchedCount === 0 && sortedMatches.length > 0) {
    for (const [index, item] of allClubGames.entries()) {
      const linked = sortedMatches[index]
      if (!linked) break
      item.game.linkedMatch = linked
      usedMatchIds.add(linked.id)
    }
  }

  return {
    slots: linkedSlots,
    linkedMatchIds: usedMatchIds,
    matchedGames: linkedSlots.flatMap((slot) => slot.games).filter((game) => game.isClubGame && Boolean(game.linkedMatch)).length,
  }
}
