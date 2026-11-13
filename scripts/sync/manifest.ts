import { hashText } from '../../src/lib/rules/hash.ts'
import type { ArmyBook, BookRule, CoreRules, SyncManifest } from '../../src/types/army-book.ts'

export { hashText }

export const CORE_SOURCE = 'core'

export function buildManifest(core: CoreRules, books: ArmyBook[], syncedAt: string): SyncManifest {
  const manifest: SyncManifest = { gameSystem: core.gameSystem, syncedAt, books: {}, rules: {} }
  const add = (rule: BookRule, source: string) => {
    const existing = manifest.rules[rule.id]
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source)
      return
    }
    manifest.rules[rule.id] = { name: rule.name, hash: hashText(rule.description), sources: [source] }
  }
  core.rules.forEach((rule) => add(rule, CORE_SOURCE))
  for (const book of books) {
    manifest.books[book.uid] = { name: book.name, version: book.version }
    book.rules.forEach((rule) => add(rule, book.uid))
  }
  return manifest
}

export interface RuleChange {
  id: string
  name: string
  sources: string[]
}

export interface ManifestDiff {
  newBooks: string[]
  removedBooks: string[]
  updatedBooks: { uid: string; from: string; to: string }[]
  newRules: RuleChange[]
  changedRules: RuleChange[]
  removedRules: RuleChange[]
}

export function diffManifests(previous: SyncManifest | null, next: SyncManifest): ManifestDiff {
  const prevBooks = previous?.books ?? {}
  const prevRules = previous?.rules ?? {}
  const change = (id: string, m: SyncManifest) => ({ id, name: m.rules[id].name, sources: m.rules[id].sources })

  return {
    newBooks: Object.keys(next.books).filter((uid) => !prevBooks[uid]),
    removedBooks: Object.keys(prevBooks).filter((uid) => !next.books[uid]),
    updatedBooks: Object.entries(next.books)
      .filter(([uid, b]) => prevBooks[uid] && prevBooks[uid].version !== b.version)
      .map(([uid, b]) => ({ uid, from: prevBooks[uid].version, to: b.version })),
    newRules: Object.keys(next.rules)
      .filter((id) => !prevRules[id])
      .map((id) => change(id, next)),
    changedRules: Object.keys(next.rules)
      .filter((id) => prevRules[id] && prevRules[id].hash !== next.rules[id].hash)
      .map((id) => change(id, next)),
    removedRules: previous
      ? Object.keys(prevRules)
          .filter((id) => !next.rules[id])
          .map((id) => change(id, previous))
      : [],
  }
}

const STAT_PATTERN = /to hit|Defense|AP\(|extra hits?|extra wounds?|takes? wounds|attacks?\b|re-roll|Quality|ignored/i

/** Rules whose text suggests they change attack numbers. A hint for review, not a classification. */
export function looksStatChanging(rule: BookRule): boolean {
  return STAT_PATTERN.test(rule.description)
}
