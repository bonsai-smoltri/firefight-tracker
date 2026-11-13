import { describe, expect, it } from 'vitest'
import coreRules from '../../data/core-rules.json'
import ruleIndex from '../../data/rule-index.json'
import type { CoreRules } from '../../types/army-book.ts'
import type { RuleIndex } from '../../types/rules.ts'
import { hashText } from './hash.ts'
import { RULE_MAPPINGS } from './mapping.ts'
import { aliasLookup, resolveRule } from './resolve.ts'

const books = import.meta.glob<{ rules: { name: string; description: string }[] }>('../../data/books/*.json', {
  eager: true,
  import: 'default',
})

const textsByName = new Map<string, Set<string>>()
for (const rule of [...(coreRules as CoreRules).rules, ...Object.values(books).flatMap((b) => b.rules)]) {
  if (!textsByName.has(rule.name)) textsByName.set(rule.name, new Set())
  textsByName.get(rule.name)!.add(hashText(rule.description))
}

describe('rule mapping', () => {
  it('covers every core rule', () => {
    const missing = (coreRules as CoreRules).rules.map((r) => r.name).filter((name) => !RULE_MAPPINGS.has(name))
    expect(missing).toEqual([])
  })

  it('names rules that exist in the bundled data, or only wrappers that do', () => {
    const unknown = [...RULE_MAPPINGS.values()]
      .filter((m) => (m.synthetic ? m.synthetic.some((name) => !textsByName.has(name)) || textsByName.has(m.name) : !textsByName.has(m.name)))
      .map((m) => m.name)
    expect(unknown).toEqual([])
  })

  it('was reviewed against the current text of each core rule', () => {
    const stale = (coreRules as CoreRules).rules
      .filter((r) => !RULE_MAPPINGS.get(r.name)?.reviewed.includes(hashText(r.description)))
      .map((r) => r.name)
    expect(stale).toEqual([])
  })

  it('has no reviewed hash that no longer matches any text, so old reviews get cleaned up', () => {
    const orphaned = [...RULE_MAPPINGS.values()].flatMap((m) => {
      const names = m.synthetic ?? [m.name]
      return m.reviewed.filter((h) => !names.some((n) => textsByName.get(n)?.has(h))).map((h) => `${m.name} ${h}`)
    })
    expect(orphaned).toEqual([])
  })

  it('was reviewed against the current text of every mapped faction rule', () => {
    const stale = [...RULE_MAPPINGS.values()].flatMap((m) =>
      (m.synthetic ?? [m.name]).flatMap((name) =>
        [...(textsByName.get(name) ?? [])].filter((h) => !m.reviewed.includes(h)).map((h) => `${name} ${h}`),
      ),
    )
    // The odd Blast text sits in eleven books' rule tables but no unit uses it.
    expect(stale).toEqual(['Blast 567e8d36'])
  })

  it('only enhances rules that are mapped', () => {
    const broken = [...RULE_MAPPINGS.values()].filter((m) => m.enhances && !RULE_MAPPINGS.has(m.enhances))
    expect(broken.map((m) => m.name)).toEqual([])
  })

  it('resolves real aliases from the bundled index', () => {
    const context = { mappings: RULE_MAPPINGS, aliasOf: aliasLookup(ruleIndex as RuleIndex) }
    const berserker = resolveRule('Berserker', null, context)
    expect(berserker.kind === 'mapped' && berserker.mapping.name).toBe('Brutal')
    const aura = resolveRule('Unstoppable when Shooting Aura', null, context)
    expect(aura.kind === 'mapped' && [aura.mapping.name, aura.mode]).toEqual(['Unstoppable', 'shooting'])
  })
})
