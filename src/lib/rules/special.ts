import type { ParsedUnit, ParsedWeapon, RuleRef } from '../../types/list.ts'

const ref = (name: string, rating: number | null = null): RuleRef => ({
  id: '',
  name,
  rating,
  label: rating === null ? name : `${name}(${rating})`,
})

/**
 * Attacks a unit makes through its rules rather than its weapons, listed next to its weapons on
 * the attack screen. Impact and Ravage roll per model with the rule; Takedown attacks are one
 * model's.
 */
export function specialAttacks(unit: ParsedUnit): ParsedWeapon[] {
  const out: ParsedWeapon[] = []
  const rating = (name: string) => unit.rules.find((r) => r.name === name)?.rating ?? null
  const longestRange = Math.max(0, ...unit.weapons.map((w) => w.range))

  const impact = rating('Impact')
  const heavyImpact = rating('Heavy Impact')
  if (impact !== null || heavyImpact !== null) {
    const heavy = heavyImpact !== null
    const dice = (heavyImpact ?? 0) + (impact ?? 0)
    out.push({
      name: heavy ? 'Heavy Impact' : 'Impact',
      label: `${heavy ? 'Heavy Impact' : 'Impact'} (${dice} dice, hit on 2+${heavy ? ', AP(1)' : ''})`,
      range: 0,
      attacks: dice,
      count: unit.size,
      rules: heavy ? [ref('AP', 1)] : [],
      special: { rule: heavy ? 'Heavy Impact' : 'Impact', when: 'When charging, before either unit attacks, unless Fatigued', fixedRoll: 2 },
    })
  }

  const ravage = rating('Ravage')
  if (ravage !== null) {
    out.push({
      name: 'Ravage',
      label: `Ravage (${ravage} dice, wound on 6)`,
      range: 0,
      attacks: ravage,
      count: unit.size,
      rules: [],
      special: { rule: 'Ravage', when: 'Once per round, before striking in melee, unless Fatigued', fixedRoll: 6, autoWound: true },
    })
  }

  const takedownRules = [ref('Reliable'), ref('AP', 2), ref('Deadly', 3), ref('Takedown')]
  const shot = rating('Takedown Shot')
  if (shot !== null && longestRange > 0) {
    out.push({
      name: 'Takedown Shot',
      label: `Takedown Shot (${longestRange}", A${shot}, Q2+, AP(2), Deadly(3))`,
      range: longestRange,
      attacks: shot,
      count: 1,
      rules: takedownRules,
      special: { rule: 'Takedown Shot', when: 'Once per game, extra attacks when shooting' },
    })
  }
  const strike = rating('Takedown Strike')
  if (strike !== null) {
    out.push({
      name: 'Takedown Strike',
      label: `Takedown Strike (A${strike}, Q2+, AP(2), Deadly(3))`,
      range: 0,
      attacks: strike,
      count: 1,
      rules: takedownRules,
      special: { rule: 'Takedown Strike', when: 'Once per game, when striking in melee' },
    })
  }
  return out
}
