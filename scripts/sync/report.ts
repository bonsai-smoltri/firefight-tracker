import type { ArmyBook, BookRule, CoreRules, SyncManifest } from '../../src/types/army-book.ts'
import { CORE_SOURCE, looksStatChanging, type ManifestDiff, type RuleChange } from './manifest.ts'

export interface ReportInput {
  core: CoreRules
  books: ArmyBook[]
  manifest: SyncManifest
  diff: ManifestDiff
  firstSync: boolean
}

export function formatReport({ core, books, manifest, diff, firstSync }: ReportInput): string {
  const bookName = (uid: string) => (uid === CORE_SOURCE ? 'Core' : (manifest.books[uid]?.name ?? uid))
  const sources = (r: RuleChange) => r.sources.map(bookName).join(', ')

  const rules = new Map<string, BookRule>()
  core.rules.forEach((r) => rules.set(r.id, r))
  books.forEach((b) => b.rules.forEach((r) => rules.has(r.id) || rules.set(r.id, r)))
  const all = [...rules.values()]
  const aliased = all.filter((r) => r.aliasedRuleId)
  const statLike = all.filter((r) => !r.aliasedRuleId && looksStatChanging(r))

  const lines: string[] = [
    '# Army Forge sync report',
    '',
    `Synced ${manifest.syncedAt}. Game system ${manifest.gameSystem}.`,
    '',
    `- Books: ${books.length}`,
    `- Core rules: ${core.rules.length}`,
    `- Unique rules: ${all.length} (${aliased.length} aliased)`,
    `- Spells: ${books.reduce((n, b) => n + b.spells.length, 0)}`,
    `- Rules that look stat-changing (excluding aliases): ${statLike.length}`,
    '',
  ]

  if (firstSync) {
    lines.push('First sync: no previous manifest to compare against.', '')
  } else {
    const section = (title: string, items: string[]) => {
      lines.push(`## ${title} (${items.length})`, '')
      lines.push(...(items.length ? items.map((i) => `- ${i}`) : ['None.']), '')
    }
    section('New books', diff.newBooks.map(bookName))
    section('Removed books', diff.removedBooks)
    section('Updated books', diff.updatedBooks.map((b) => `${bookName(b.uid)}: ${b.from} → ${b.to}`))
    section('New rules', diff.newRules.map((r) => `${r.name} (${sources(r)})`))
    section(
      'Changed rule text — review mappings',
      diff.changedRules.map((r) => `${r.name} (${sources(r)}): ${rules.get(r.id)?.description ?? ''}`),
    )
    section('Removed rules', diff.removedRules.map((r) => `${r.name} (${sources(r)})`))
  }

  return lines.join('\n')
}
