import type { BookSpell } from '../../types/army-book.ts'
import type { ParsedWeapon, RuleRef } from '../../types/list.ts'

const HITS = /takes? (\d+) hits?(?: with (.+?))?(?: each)?\./
const RULE = /^([A-Za-z][A-Za-z\- ]*?)(?:\((\d+)\))?$/

/**
 * Turns a spell that deals hits ("takes 3 hits with AP(1) and Shatter") into an attack the engine
 * can resolve. Returns null for spells that do anything else.
 */
export function spellAttack(spell: BookSpell): ParsedWeapon | null {
  const match = HITS.exec(spell.effect)
  if (!match) return null

  const rules: RuleRef[] = []
  for (const part of (match[2] ?? '').split(/,| and /).map((p) => p.trim()).filter(Boolean)) {
    const rule = RULE.exec(part)
    if (!rule) return null
    const rating = rule[2] ? Number(rule[2]) : null
    rules.push({ id: '', name: rule[1], rating, label: rating === null ? rule[1] : `${rule[1]}(${rating})` })
  }

  const range = Number(/within (\d+)"/.exec(spell.effect)?.[1] ?? 0)
  return {
    name: spell.name,
    label: `${spell.name} (${match[1]} hit${match[1] === '1' ? '' : 's'}${rules.length ? `, ${rules.map((r) => r.label).join(', ')}` : ''})`,
    range: Math.max(range, 1),
    attacks: Number(match[1]),
    count: 1,
    rules,
    special: {
      rule: 'Spell',
      when: spell.effect,
      autoHit: true,
      rollForSixes: /on rolls of 6/.test(spell.effect),
      spell: true,
      singleModel: /as if the target was a unit of \[1\]/.test(spell.effect),
    },
  }
}
