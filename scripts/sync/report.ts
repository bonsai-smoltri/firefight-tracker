import { RULE_MAPPINGS } from '../../src/lib/rules/mapping.ts'
import { aliasLookup, resolveRule } from '../../src/lib/rules/resolve.ts'
import type { ArmyBook, BookRule, CoreRules, SyncManifest } from '../../src/types/army-book.ts'
import type { RuleIndex } from '../../src/types/rules.ts'
import { CORE_SOURCE, hashText, looksStatChanging, type ManifestDiff, type RuleChange } from './manifest.ts'

export interface ReportInput {
  core: CoreRules
  books: ArmyBook[]
  manifest: SyncManifest
  /** Null when there's nothing to compare against, e.g. an offline rebuild or the first sync. */
  diff: ManifestDiff | null
}

export function buildRuleIndex(core: CoreRules, books: ArmyBook[]): RuleIndex {
  const index: RuleIndex = {}
  for (const rule of [...core.rules, ...books.flatMap((b) => b.rules)]) {
    index[rule.id] ??= { name: rule.name, alias: rule.aliasedRuleId }
  }
  return index
}

export interface MappingStatus {
  /** Mapped by name, but this text hasn't been reviewed. */
  needsReview: BookRule[]
  /** Not reachable through a mapping, alias or wrapper, and the text mentions attack numbers. */
  unmappedStat: BookRule[]
  unmappedOther: BookRule[]
  direct: number
  indirect: number
}

export function mappingStatus(rules: BookRule[], index: RuleIndex): MappingStatus {
  const context = { mappings: RULE_MAPPINGS, aliasOf: aliasLookup(index) }
  const status: MappingStatus = { needsReview: [], unmappedStat: [], unmappedOther: [], direct: 0, indirect: 0 }
  for (const rule of rules) {
    const direct = RULE_MAPPINGS.get(rule.name)
    if (direct) {
      status.direct++
      if (!direct.reviewed.includes(hashText(rule.description))) status.needsReview.push(rule)
      continue
    }
    const resolved = resolveRule(rule.name, null, context)
    const synthetic = resolved.kind === 'mapped' ? resolved.mapping : resolved.kind === 'grant' && resolved.base.kind === 'mapped' ? resolved.base.mapping : null
    if (synthetic?.synthetic?.includes(rule.name) && !synthetic.reviewed.includes(hashText(rule.description))) {
      status.needsReview.push(rule)
    }
    if (resolved.kind !== 'unmapped') status.indirect++
    else if (looksStatChanging(rule)) status.unmappedStat.push(rule)
    else status.unmappedOther.push(rule)
  }
  return status
}

export function formatReport({ core, books, manifest, diff }: ReportInput): string {
  const bookName = (uid: string) => (uid === CORE_SOURCE ? 'Core' : (manifest.books[uid]?.name ?? uid))
  const sources = (r: RuleChange) => r.sources.map(bookName).join(', ')
  const sourcesOf = (rule: BookRule) => manifest.rules[rule.id]?.sources.map(bookName).join(', ') ?? ''

  const rules = new Map<string, BookRule>()
  core.rules.forEach((r) => rules.set(r.id, r))
  books.forEach((b) => b.rules.forEach((r) => rules.has(r.id) || rules.set(r.id, r)))
  const all = [...rules.values()].sort((a, b) => a.name.localeCompare(b.name))
  const status = mappingStatus(all, buildRuleIndex(core, books))

  const lines: string[] = [
    '# Army Forge sync report',
    '',
    `Synced ${manifest.syncedAt}. Game system ${manifest.gameSystem}.`,
    '',
    `- Books: ${books.length}`,
    `- Core rules: ${core.rules.length}`,
    `- Unique rules: ${all.length}`,
    `- Spells: ${books.reduce((n, b) => n + b.spells.length, 0)}`,
    `- Mapped by name: ${status.direct}`,
    `- Mapped through an alias or wrapper: ${status.indirect}`,
    `- Unmapped, look stat-changing: ${status.unmappedStat.length}`,
    `- Unmapped, look text-only: ${status.unmappedOther.length}`,
    '',
  ]
  const section = (title: string, items: string[]) => {
    lines.push(`## ${title} (${items.length})`, '')
    lines.push(...(items.length ? items.map((i) => `- ${i}`) : ['None.']), '')
  }

  section(
    'Mapped rules with unreviewed text',
    status.needsReview.map((r) => `**${r.name}** \`${hashText(r.description)}\` (${sourcesOf(r)}): ${r.description}`),
  )

  if (diff) {
    section('New books', diff.newBooks.map(bookName))
    section('Removed books', diff.removedBooks)
    section('Updated books', diff.updatedBooks.map((b) => `${bookName(b.uid)}: ${b.from} → ${b.to}`))
    section('New rules', diff.newRules.map((r) => `${r.name} (${sources(r)})`))
    section(
      'Changed rule text',
      diff.changedRules.map((r) => `${r.name} (${sources(r)}): ${rules.get(r.id)?.description ?? ''}`),
    )
    section('Removed rules', diff.removedRules.map((r) => `${r.name} (${sources(r)})`))
  } else {
    lines.push('No previous manifest to compare against.', '')
  }

  section(
    'Unmapped rules that look stat-changing',
    status.unmappedStat.map((r) => `**${r.name}** (${sourcesOf(r)}): ${r.description}`),
  )

  return lines.join('\n')
}
