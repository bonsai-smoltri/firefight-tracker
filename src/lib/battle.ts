import type {
  ActivationAction,
  AuraAssignment,
  BattleState,
  LogEntry,
  PendingMorale,
  Player,
  SpellCast,
  UnitKey,
  UnitState,
} from '../types/battle'
import type { ParsedList, RuleRef } from '../types/list'
import type { AttackMode } from '../types/rules'

export const MAX_ROUNDS = 4
export const MAX_SPELL_TOKENS = 6
export const PLAYERS: Player[] = ['A', 'B']

export const unitKey = (player: Player, unitId: string): UnitKey => `${player}:${unitId}`
export const otherPlayer = (player: Player): Player => (player === 'A' ? 'B' : 'A')

export const modelsLeft = (u: UnitState) => (u.routed ? 0 : Math.max(0, u.size - Math.floor(u.wounds / u.tough)))
export const isOut = (u: UnitState) => u.routed || u.wounds >= u.size * u.tough

/** Half or less of its starting size, or of its Tough value for single-model units. */
export function atHalfOrLess(u: UnitState): boolean {
  if (u.size === 1) return u.tough - u.wounds <= u.tough / 2
  return modelsLeft(u) <= u.size / 2
}

const units = (state: BattleState) => Object.values(state.units)

export function unitsLeftToActivate(state: BattleState, player: Player): UnitState[] {
  return units(state).filter((u) => u.player === player && !u.activated && !isOut(u))
}

export const roundOver = (state: BattleState) =>
  !state.activation && state.pendingMorale.length === 0 && PLAYERS.every((p) => unitsLeftToActivate(state, p).length === 0)

export interface NewBattle {
  lists: Record<Player, ParsedList>
  firstPlayer: Player
  objectiveCount: number
  auras: AuraAssignment[]
  now?: number
}

export function createBattle({ lists, firstPlayer, objectiveCount, auras, now = Date.now() }: NewBattle): BattleState {
  const unitStates: Record<UnitKey, UnitState> = {}
  for (const player of PLAYERS) {
    for (const u of lists[player].units) {
      const key = unitKey(player, u.id)
      unitStates[key] = {
        key,
        player,
        unitId: u.id,
        name: u.customName ?? u.name,
        size: u.size,
        tough: u.tough,
        quality: u.quality,
        wounds: 0,
        shaken: false,
        fatigued: false,
        activated: false,
        lastAction: null,
        moved: false,
        routed: false,
        caster: u.caster,
        spellTokens: Math.min(MAX_SPELL_TOKENS, u.caster ?? 0),
        fear: u.rules.filter((r) => r.name === 'Fear').reduce((n, r) => n + (r.rating ?? 1), 0),
      }
    }
  }
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: now,
    listNames: { A: lists.A.name, B: lists.B.name },
    round: 1,
    firstPlayer,
    turn: firstPlayer,
    finishedFirst: null,
    units: unitStates,
    auras,
    objectives: Array.from({ length: objectiveCount }, () => null),
    activation: null,
    pendingMorale: [],
    log: [],
    complete: false,
  }
}

const log = (state: BattleState, entry: LogEntry): LogEntry[] => [...state.log, entry]
const update = (state: BattleState, key: UnitKey, changes: Partial<UnitState>): BattleState => ({
  ...state,
  units: { ...state.units, [key]: { ...state.units[key], ...changes } },
})

export function startActivation(state: BattleState, key: UnitKey, action: ActivationAction): BattleState {
  const unit = state.units[key]
  if (!unit || state.activation || isOut(unit) || unit.activated) return state
  const moved = action === 'advance' || action === 'rush' || action === 'charge'
  return {
    ...update(state, key, { moved: unit.moved || moved }),
    activation: { unit: key, action, woundsTaken: {}, melee: null, spellsTried: [], attacked: false },
    log: log(state, { type: 'activation', round: state.round, unit: key, action }),
  }
}

export interface AttackRecord {
  attacker: UnitKey
  target: UnitKey
  weapon: string
  mode: AttackMode
  wounds: number
  /** The target striking back at a charger. */
  strikeBack?: boolean
  /** Hits from a spell, which isn't the caster attacking. */
  spell?: boolean
}

export function recordAttack(state: BattleState, attack: AttackRecord): BattleState {
  const target = state.units[attack.target]
  const attacker = state.units[attack.attacker]
  if (!target || !attacker) return state

  const remaining = target.size * target.tough - target.wounds
  const wounds = Math.max(0, Math.min(attack.wounds, remaining))
  let next = update(state, attack.target, { wounds: target.wounds + wounds })

  if (attack.mode === 'melee') next = update(next, attack.attacker, { fatigued: true })

  const activation = next.activation
  if (activation) {
    const isCharge =
      attack.mode === 'melee' && !attack.strikeBack && activation.action === 'charge' && activation.unit === attack.attacker
    next = {
      ...next,
      activation: {
        ...activation,
        attacked: activation.attacked || (activation.unit === attack.attacker && !attack.strikeBack && !attack.spell),
        woundsTaken: { ...activation.woundsTaken, [attack.target]: (activation.woundsTaken[attack.target] ?? 0) + wounds },
        melee: isCharge
          ? (activation.melee ?? { charger: attack.attacker, target: attack.target, struckBack: false })
          : attack.strikeBack && activation.melee
            ? { ...activation.melee, struckBack: true }
            : activation.melee,
      },
    }
  }

  return {
    ...next,
    log: log(next, {
      type: 'attack',
      round: state.round,
      attacker: attack.attacker,
      target: attack.target,
      weapon: attack.weapon,
      mode: attack.mode,
      wounds,
      modelsLeft: modelsLeft(next.units[attack.target]),
      strikeBack: attack.strikeBack ?? false,
    }),
  }
}

/** The loser of a melee: whoever took more wounds this activation, counting Fear. Null on a draw. */
export function meleeLoser(state: BattleState): UnitKey | null {
  const melee = state.activation?.melee
  if (!melee) return null
  const taken = state.activation!.woundsTaken
  const charger = state.units[melee.charger]
  const target = state.units[melee.target]
  const chargerScore = (taken[melee.charger] ?? 0) + target.fear
  const targetScore = (taken[melee.target] ?? 0) + charger.fear
  if (chargerScore === targetScore) return null
  return chargerScore > targetScore ? melee.charger : melee.target
}

/**
 * Works out the morale tests this activation causes. Shaken units always fail, so they are
 * resolved straight away; the rest wait for `resolveMorale`.
 */
export function endActivation(state: BattleState): BattleState {
  const activation = state.activation
  if (!activation || state.pendingMorale.length > 0) return state

  const tests: PendingMorale[] = []
  const inMelee = new Set(activation.melee ? [activation.melee.charger, activation.melee.target] : [])
  const loser = meleeLoser(state)
  if (loser && !isOut(state.units[loser])) {
    tests.push({ unit: loser, reason: 'melee', routsOnFail: atHalfOrLess(state.units[loser]) })
  }
  for (const [key, wounds] of Object.entries(activation.woundsTaken)) {
    const unit = state.units[key]
    if (wounds > 0 && !inMelee.has(key) && !isOut(unit) && atHalfOrLess(unit)) {
      tests.push({ unit: key, reason: 'wounds', routsOnFail: false })
    }
  }

  let next: BattleState = { ...state, pendingMorale: tests }
  for (const test of tests.filter((t) => state.units[t.unit].shaken)) {
    next = applyMorale(next, test, false)
  }
  return next.pendingMorale.length === 0 ? finishActivation(next) : next
}

function applyMorale(state: BattleState, test: PendingMorale, passed: boolean): BattleState {
  const result = passed ? 'passed' : test.routsOnFail ? 'routed' : 'shaken'
  let next: BattleState = { ...state, pendingMorale: state.pendingMorale.filter((t) => t !== test) }
  if (result === 'routed') next = update(next, test.unit, { routed: true })
  if (result === 'shaken') next = update(next, test.unit, { shaken: true })
  return { ...next, log: log(next, { type: 'morale', round: state.round, unit: test.unit, reason: test.reason, result }) }
}

export function resolveMorale(state: BattleState, key: UnitKey, passed: boolean): BattleState {
  const test = state.pendingMorale.find((t) => t.unit === key)
  if (!test) return state
  const next = applyMorale(state, test, passed && !state.units[key].shaken)
  return next.pendingMorale.length === 0 && next.activation ? finishActivation(next) : next
}

function finishActivation(state: BattleState): BattleState {
  const activation = state.activation
  if (!activation) return state
  const unit = state.units[activation.unit]
  let next = update(state, activation.unit, {
    activated: true,
    lastAction: activation.action,
    shaken: activation.action === 'idle' ? false : unit.shaken,
  })
  next = { ...next, activation: null }

  const player = unit.player
  const opponent = otherPlayer(player)
  const finishedFirst = next.finishedFirst ?? (unitsLeftToActivate(next, player).length === 0 ? player : null)
  const turn = unitsLeftToActivate(next, opponent).length > 0 ? opponent : player
  return { ...next, finishedFirst, turn }
}

/** Net casting modifier: friendly helpers add, enemy ones subtract, plus Spell Amplifier on the caster. */
export function castingModifier(state: BattleState, cast: Pick<SpellCast, 'caster' | 'helpers'>, amplified: boolean): number {
  const player = state.units[cast.caster].player
  const help = Object.entries(cast.helpers).reduce(
    (total, [key, tokens]) => total + (state.units[key]?.player === player ? tokens : -tokens),
    0,
  )
  return help + (amplified ? 1 : 0)
}

/** Casts succeed on 4+ after modifiers; 6s always succeed and 1s always fail. */
export const castSucceeds = (face: number, modifier: number) => face === 6 || (face !== 1 && face + modifier >= 4)

/** Why a caster can't try this spell now, or null if it can. */
export function castBlocked(state: BattleState, caster: UnitKey, spell: string, cost: number): string | null {
  const activation = state.activation
  const unit = state.units[caster]
  if (!activation || activation.unit !== caster) return 'Only during this unit’s activation'
  if (activation.action === 'idle') return 'Shaken units stay idle'
  if (activation.attacked) return 'Spells are cast before attacking'
  if (activation.spellsTried?.includes(spell)) return 'Already tried this activation'
  if (unit.spellTokens < cost) return `Needs ${cost} token${cost === 1 ? '' : 's'}`
  return null
}

export function castSpell(state: BattleState, cast: SpellCast, amplified = false): BattleState {
  if (castBlocked(state, cast.caster, cast.spell, cast.cost)) return state
  let next = update(state, cast.caster, { spellTokens: state.units[cast.caster].spellTokens - cast.cost })
  for (const [key, tokens] of Object.entries(cast.helpers)) {
    const helper = next.units[key]
    if (helper && tokens > 0) next = update(next, key, { spellTokens: Math.max(0, helper.spellTokens - tokens) })
  }
  const activation = next.activation!
  return {
    ...next,
    activation: { ...activation, spellsTried: [...(activation.spellsTried ?? []), cast.spell] },
    log: log(next, {
      type: 'spell',
      round: state.round,
      caster: cast.caster,
      spell: cast.spell,
      cost: cast.cost,
      modifier: castingModifier(state, cast, amplified),
      succeeded: cast.succeeded,
    }),
  }
}

export function cancelActivation(state: BattleState): BattleState {
  // Only before anything was recorded, so there is nothing to undo.
  if (!state.activation || Object.keys(state.activation.woundsTaken).length > 0 || state.activation.spellsTried?.length) {
    return state
  }
  return { ...state, activation: null, log: state.log.slice(0, -1) }
}

export function endRound(state: BattleState, objectives: (Player | null)[]): BattleState {
  if (!roundOver(state) || state.complete) return state
  const nextLog = log(state, { type: 'round', round: state.round, objectives })
  if (state.round >= MAX_ROUNDS) return { ...state, objectives, log: nextLog, complete: true }

  const unitStates: Record<UnitKey, UnitState> = {}
  for (const u of units(state)) {
    unitStates[u.key] = {
      ...u,
      activated: false,
      lastAction: null,
      fatigued: false,
      moved: false,
      spellTokens: Math.min(MAX_SPELL_TOKENS, u.spellTokens + (u.caster ?? 0)),
    }
  }
  const firstPlayer = state.finishedFirst ?? state.firstPlayer
  const next: BattleState = {
    ...state,
    round: state.round + 1,
    units: unitStates,
    objectives,
    firstPlayer,
    finishedFirst: null,
    log: nextLog,
  }
  return { ...next, turn: unitsLeftToActivate(next, firstPlayer).length > 0 ? firstPlayer : otherPlayer(firstPlayer) }
}

export function setWounds(state: BattleState, key: UnitKey, wounds: number): BattleState {
  const unit = state.units[key]
  if (!unit) return state
  const clamped = Math.max(0, Math.min(wounds, unit.size * unit.tough))
  if (clamped === unit.wounds) return state
  const next = update(state, key, { wounds: clamped })
  return { ...next, log: log(next, { type: 'wounds', round: state.round, unit: key, from: unit.wounds, to: clamped }) }
}

export const setShaken = (state: BattleState, key: UnitKey, shaken: boolean) => update(state, key, { shaken })
export const setSpellTokens = (state: BattleState, key: UnitKey, tokens: number) =>
  update(state, key, { spellTokens: Math.max(0, Math.min(MAX_SPELL_TOKENS, tokens)) })

/** Rules a unit gets from other units' Auras, while the holder is still on the table. */
export function grantedByAuras(state: BattleState, key: UnitKey): RuleRef[] {
  return state.auras
    .filter((a) => a.recipients.includes(key) && !isOut(state.units[a.holder]))
    .map((a) => {
      const name = a.rule.replace(/ Aura$/, '').replace(/\(\d+\)$/, '')
      return { id: '', name, rating: a.rating, label: `${a.rule} from ${state.units[a.holder].name}` }
    })
}

export function winner(state: BattleState): Player | 'draw' {
  const count = (p: Player) => state.objectives.filter((o) => o === p).length
  const a = count('A')
  const b = count('B')
  return a === b ? 'draw' : a > b ? 'A' : 'B'
}
