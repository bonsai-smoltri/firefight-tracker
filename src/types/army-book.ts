/** A special rule as bundled from Army Forge (core or army book). */
export interface BookRule {
  id: string
  name: string
  /** Set when Army Forge declares this rule a reskin of another, e.g. Berserker -> Brutal. */
  aliasedRuleId: string | null
  description: string
  hasRating: boolean
}

export interface BookSpell {
  id: string
  name: string
  /** Spell tokens needed to cast. */
  threshold: number
  effect: string
}

export interface ArmyBook {
  uid: string
  name: string
  version: string
  rules: BookRule[]
  spells: BookSpell[]
}

export interface CoreRules {
  gameSystem: number
  rules: BookRule[]
}

export interface ManifestRule {
  name: string
  /** Hash of the description, so a reworded rule is flagged for review. */
  hash: string
  /** Book uids the rule appears in; `core` for core rules. */
  sources: string[]
}

export interface SyncManifest {
  gameSystem: number
  syncedAt: string
  books: Record<string, { name: string; version: string }>
  rules: Record<string, ManifestRule>
}
