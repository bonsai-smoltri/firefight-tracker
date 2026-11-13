import type { ArmyBook, BookRule, BookSpell, CoreRules } from '../../src/types/army-book.ts'

export const API_BASE = 'https://army-forge.onepagerules.com/api'
export const GAME_SYSTEM_ID = 3
export const GAME_SYSTEM_SLUG = 'gff'

export const urls = {
  coreRules: () => `${API_BASE}/rules/common/${GAME_SYSTEM_ID}`,
  bookIndex: () => `${API_BASE}/army-books?filters=official&gameSystemSlug=${GAME_SYSTEM_SLUG}`,
  book: (uid: string) => `${API_BASE}/army-books/${uid}?gameSystem=${GAME_SYSTEM_SLUG}`,
}

export interface BookIndexEntry {
  uid: string
  name: string
  enabledGameSystems: number[]
}

type Raw = Record<string, unknown>

function asArray(value: unknown, what: string): Raw[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${what} to be an array`)
  return value as Raw[]
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`Expected ${what} to be a string`)
  return value
}

function trimRule(raw: Raw): BookRule {
  const name = asString(raw.name, 'rule name')
  return {
    id: asString(raw.id, `id of ${name}`),
    name,
    aliasedRuleId: typeof raw.aliasedRuleId === 'string' ? raw.aliasedRuleId : null,
    description: typeof raw.description === 'string' ? raw.description : '',
    hasRating: raw.hasRating === true,
  }
}

function trimSpell(raw: Raw): BookSpell {
  const name = asString(raw.name, 'spell name')
  return {
    id: asString(raw.id, `id of spell ${name}`),
    name,
    threshold: typeof raw.threshold === 'number' ? raw.threshold : 0,
    effect: typeof raw.effect === 'string' ? raw.effect : '',
  }
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)

export function trimCoreRules(raw: unknown): CoreRules {
  const rules = asArray((raw as Raw).rules, 'core rules').map(trimRule).sort(byName)
  return { gameSystem: GAME_SYSTEM_ID, rules }
}

export function trimBook(raw: unknown): ArmyBook {
  const book = raw as Raw
  return {
    uid: asString(book.uid, 'book uid'),
    name: asString(book.name, 'book name'),
    version: asString(book.versionString, 'book version'),
    rules: asArray(book.specialRules ?? [], 'book rules').map(trimRule).sort(byName),
    spells: asArray(book.spells ?? [], 'book spells').map(trimSpell).sort(byName),
  }
}

export function firefightBooks(raw: unknown): BookIndexEntry[] {
  return asArray(raw, 'book index')
    .map((b) => ({
      uid: asString(b.uid, 'book uid'),
      name: asString(b.name, 'book name'),
      enabledGameSystems: Array.isArray(b.enabledGameSystems) ? (b.enabledGameSystems as number[]) : [],
    }))
    .filter((b) => b.enabledGameSystems.includes(GAME_SYSTEM_ID))
    .sort(byName)
}
