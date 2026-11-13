/**
 * Rules engine types.
 *
 * Every OPR special rule that changes attack numbers is described by a `RuleMapping`: one or more
 * `RulePart`s, each held by the attacker or the defender, with conditions and effects. Rules that
 * change no numbers are mapped as text only, so they count as reviewed. Anything else is unmapped
 * and never touches the maths.
 */

export const SITUATION_KEYS = [
  'charging',
  'chargeOverSix',
  'overNine',
  'overTwelve',
  'overHalfRange',
  'attackerHeld',
  'attackerFatigued',
  'attackerNearTerrain',
  'targetInCover',
  'targetNearTerrain',
  'targetStationary',
  'targetAboveHalf',
  'targetShaken',
  'targetFatigued',
] as const

export type SituationKey = (typeof SITUATION_KEYS)[number]

export type Situation = Record<SituationKey, boolean>

export interface SituationDef {
  key: SituationKey
  label: string
  hint: string
}

export const SITUATION_DEFS: SituationDef[] = [
  { key: 'charging', label: 'Charging', hint: 'The attacker charged this activation' },
  { key: 'chargeOverSix', label: 'Charged > 6"', hint: 'The charge started over 6" away' },
  { key: 'overNine', label: '> 9"', hint: 'Shooting at a target over 9" away' },
  { key: 'overTwelve', label: '> 12"', hint: 'Shooting at a target over 12" away' },
  { key: 'overHalfRange', label: '> half range', hint: "The target is over half the weapon's range away" },
  { key: 'attackerHeld', label: 'Held', hint: 'The attacker used a Hold action' },
  { key: 'attackerFatigued', label: 'Fatigued', hint: 'The attacker already fought in melee this round, or is Shaken' },
  { key: 'attackerNearTerrain', label: 'By terrain', hint: 'Most of the attacker is within 1" of terrain' },
  { key: 'targetInCover', label: 'Cover', hint: 'Most of the target is in cover or behind sight blockers' },
  { key: 'targetNearTerrain', label: 'Target by terrain', hint: 'Most of the target is within 1" of terrain' },
  { key: 'targetStationary', label: "Target hasn't moved", hint: "The target hasn't moved this round" },
  { key: 'targetAboveHalf', label: 'Target above half', hint: 'The target has more than half its size, or Tough for one model' },
  { key: 'targetShaken', label: 'Target Shaken', hint: 'The target is Shaken' },
  { key: 'targetFatigued', label: 'Target Fatigued', hint: 'The target has fought in melee this round' },
]

/** Situations that are true more often than not start switched on. */
const DEFAULT_ON: SituationKey[] = ['targetAboveHalf']

export function defaultSituation(): Situation {
  return Object.fromEntries(SITUATION_KEYS.map((k) => [k, DEFAULT_ON.includes(k)])) as Situation
}

export type AttackMode = 'shooting' | 'melee'

export interface RuleConditions {
  mode?: AttackMode
  /** Every listed situation must be true. */
  situation?: SituationKey[]
  /** At least one listed situation must be true. */
  anySituation?: SituationKey[]
  /** None of the listed situations may be true. */
  notSituation?: SituationKey[]
  /** Target's Defense value must be within this range, inclusive (e.g. 4–6 for Defense 4+ to 6+). */
  targetDefense?: [number, number]
  /** Target's Tough must be at least this (e.g. 9 for "Tough(9) or higher"). */
  targetToughAtLeast?: number
  /** True: only against spells. False: only against anything but spells. */
  fromSpell?: boolean
}

export interface RuleEffects {
  /** Positive is easier to hit. */
  hitModifier?: number
  /** Attacks at this Quality instead of the unit's (Reliable). */
  quality?: number
  ap?: number
  /** Hits from unmodified 6s to hit get this much extra AP. */
  apOnSix?: number
  /** Each unmodified 6 to hit deals this many extra hits. */
  extraHitsOnSix?: number
  /** Each unmodified hit roll of `on` or more generates `count` extra attacks, which don't generate more. */
  extraAttacks?: { count: number; on: number }
  /** Each unmodified 1 to block deals this many extra wounds. */
  extraWoundsOnOne?: number
  /** Deadly(X): each wound is multiplied, up to the target model's Tough. */
  woundMultiplier?: number
  /** Blast(X): hits are multiplied, up to the number of models in the target. */
  blast?: number
  ignoresCover?: boolean
  ignoresRegeneration?: boolean
  /** The target re-rolls successful unmodified Defense results of this or more. */
  rerollDefenseFrom?: number
  /** Ignores negative modifiers from the target's rules (Unstoppable). */
  ignoresNegativeModifiers?: boolean
  /** Ignores all positive Defense modifiers on the target, cover included (Pierce). */
  ignoresDefenseBonuses?: boolean

  /** Positive is better for the defender. */
  defenseModifier?: number
  /** Counts as having Defense X+ (Armor). */
  defense?: number
  /** Hits against this unit lose this much AP, to a minimum of 0. */
  apReduction?: number
  /** Each wound is ignored on this roll or more. */
  ignoreWoundsOn?: number
  /** Parry(X): X dice per model in melee, each 6+ ignores a hit. */
  parry?: number
}

export interface RulePart {
  side: 'attacker' | 'defender'
  conditions?: RuleConditions
  /**
   * Only applies when switched on for this attack. `true` gives one toggle named after the rule;
   * a string gives a named option, for rules with a choice or a token count.
   */
  manual?: boolean | string
  effects: RuleEffects | ((rating: number | null) => RuleEffects)
}

export interface RuleMapping {
  name: string
  /** Hashes of the rule texts this mapping was checked against. A new text needs review. */
  reviewed: string[]
  /** Empty when the rule changes no numbers. */
  parts: RulePart[]
  /** Only applies if the unit also has this rule, and replaces it (Enhanced Predator). */
  enhances?: string
  /** Shown next to the rule, e.g. why it isn't in the maths yet. */
  note?: string
  /**
   * Benefits every friendly unit attacking a marked enemy, not just the holder (Precision Target).
   * The holder gets nothing by itself; it's offered as a toggle for the whole army.
   */
  armyWide?: boolean
  /** An army-wide effect put on an enemy unit (Debuffs), so it's toggled on the other army's units. */
  onEnemy?: boolean
  /**
   * Set when no rule of this name exists, only wrappers around it (Piercing Fighter Aura). Lists
   * those wrappers; `reviewed` then holds their text hashes.
   */
  synthetic?: string[]
}

export function manualKey(mapping: RuleMapping, part: RulePart): string | null {
  if (!part.manual) return null
  return typeof part.manual === 'string' ? `${mapping.name}: ${part.manual}` : mapping.name
}

/** Rule id to name and alias, generated by the sync script. */
export type RuleIndex = Record<string, { name: string; alias: string | null }>
