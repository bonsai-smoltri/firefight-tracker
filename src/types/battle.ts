import type { AttackMode } from './rules'

export type Player = 'A' | 'B'

/** Idle is how a Shaken unit spends its activation to recover. */
export type ActivationAction = 'hold' | 'advance' | 'rush' | 'charge' | 'idle'

/** Units are keyed `${player}:${selectionId}`, as selection ids are only unique within a list. */
export type UnitKey = string

export interface UnitState {
  key: UnitKey
  player: Player
  unitId: string
  name: string
  size: number
  tough: number
  quality: number
  wounds: number
  shaken: boolean
  fatigued: boolean
  activated: boolean
  /** Action taken this round, once its activation is done. Missing in battles saved before it existed. */
  lastAction?: ActivationAction | null
  /** Moved this round, for rules such as Entrenched. */
  moved: boolean
  routed: boolean
  caster: number | null
  spellTokens: number
  /** Fear(X): enemies count as having taken this many more wounds when checking who won a melee. */
  fear: number
}

export interface AuraAssignment {
  holder: UnitKey
  /** Rule label on the holder, e.g. "Stealth Aura". */
  rule: string
  rating: number | null
  /** Up to two other friendly units; the holder's own unit always has it. */
  recipients: UnitKey[]
}

export interface Activation {
  unit: UnitKey
  action: ActivationAction
  /** Wounds each unit took during this activation, for morale and melee results. */
  woundsTaken: Record<UnitKey, number>
  /** Set by a Charge: the melee this activation resolves. */
  melee: { charger: UnitKey; target: UnitKey; struckBack: boolean } | null
  /** Spells tried this activation, as only one try per spell is allowed. Missing in older saves. */
  spellsTried?: string[]
  /** The unit has attacked, so it can no longer cast ("before attacking"). Missing in older saves. */
  attacked?: boolean
}

export interface SpellCast {
  caster: UnitKey
  spell: string
  cost: number
  /** Tokens other casters spend to help (friendly, +1 each) or hinder (enemy, -1 each). */
  helpers: Record<UnitKey, number>
  succeeded: boolean
}

export type MoraleReason = 'wounds' | 'melee'

export interface PendingMorale {
  unit: UnitKey
  reason: MoraleReason
  /** A failed test routs the unit instead of shaking it (melee loser at half or less). */
  routsOnFail: boolean
}

export type LogEntry =
  | { type: 'activation'; round: number; unit: UnitKey; action: ActivationAction }
  | {
      type: 'attack'
      round: number
      attacker: UnitKey
      target: UnitKey
      weapon: string
      mode: AttackMode
      wounds: number
      modelsLeft: number
      strikeBack: boolean
    }
  | { type: 'wounds'; round: number; unit: UnitKey; from: number; to: number }
  | { type: 'morale'; round: number; unit: UnitKey; reason: MoraleReason; result: 'passed' | 'shaken' | 'routed' }
  | { type: 'round'; round: number; objectives: (Player | null)[] }
  | { type: 'spell'; round: number; caster: UnitKey; spell: string; cost: number; modifier: number; succeeded: boolean }

export interface BattleState {
  id: string
  startedAt: number
  listNames: Record<Player, string>
  round: number
  /** Who activates first this round. */
  firstPlayer: Player
  /** Whose turn it is to activate. */
  turn: Player
  /** First player to run out of units this round; they go first next round. */
  finishedFirst: Player | null
  units: Record<UnitKey, UnitState>
  auras: AuraAssignment[]
  objectives: (Player | null)[]
  activation: Activation | null
  pendingMorale: PendingMorale[]
  log: LogEntry[]
  complete: boolean
}
