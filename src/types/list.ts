/** A special rule on a unit or weapon, e.g. Tough(9) is { name: 'Tough', rating: 9 }. */
export interface RuleRef {
  /** Empty when Army Forge sent no id and the list's rule table has no rule of that name. */
  id: string
  name: string
  rating: number | null
  label: string
}

export interface ParsedWeapon {
  name: string
  label: string
  /** Inches. 0 means melee only. */
  range: number
  attacks: number
  /** Total copies across the unit, so attacks are multiplied by this, not by model count. */
  count: number
  rules: RuleRef[]
  /** Set for attacks made by a unit rule rather than a weapon, e.g. Impact. */
  special?: SpecialAttack
}

export interface SpecialAttack {
  /** Rule that makes the attack, e.g. Impact. */
  rule: string
  /** When it can be used, shown with the attack. */
  when: string
  /**
   * Unmodified roll each die needs. Set for rolls that aren't hit rolls (Impact, Ravage), which
   * ignore hit modifiers and the unit's own rules.
   */
  fixedRoll?: number
  /** Each success is a wound with no Defense roll (Ravage). */
  autoWound?: boolean
}

export interface ParsedUnit {
  /** Army Forge's selection id; stable within a list and used for joins. */
  id: string
  /** Unit type from the army book, e.g. Veterans. */
  name: string
  /** Name the player gave this unit in Army Forge. */
  customName: string | null
  /** Models in the unit. */
  size: number
  quality: number
  defense: number
  /** Wounds per model; 1 unless the unit has Tough(X). */
  tough: number
  /** Unit cost including upgrades. */
  points: number
  /** Base rules plus rules granted by upgrade items. */
  rules: RuleRef[]
  weapons: ParsedWeapon[]
  /** Unit id this one joined (a Hero joined to a unit), if any. */
  joinedTo: string | null
  /** Spell tokens per round from Caster(X), if any. */
  caster: number | null
  /** Army book uid, for looking up spells. */
  armyId: string
}

export interface RuleText {
  name: string
  description: string
  aliasedRuleId: string | null
}

export interface ParsedList {
  source: { kind: 'share'; shareId: string }
  name: string
  points: number
  pointsLimit: number | null
  units: ParsedUnit[]
  /** Text for every rule the list uses, keyed by rule id. */
  rules: Record<string, RuleText>
  /** Army Forge's own list-building errors, shown as is. */
  listErrors: string[]
  /** Anything the parser had to guess at. */
  warnings: string[]
  importedAt: string
}
