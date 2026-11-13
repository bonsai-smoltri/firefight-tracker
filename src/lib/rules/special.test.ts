import { describe, expect, it } from 'vitest'
import { rollAttack, type RollDie } from './dice.ts'
import { resolveAttack } from './engine.ts'
import { attack, rule, unit, weapon } from './fixtures.ts'
import { specialAttacks } from './special.ts'

const faces = (...values: number[]): RollDie => {
  let i = 0
  return () => values[i++]
}

describe('specialAttacks', () => {
  it('lists the attacks a unit gets from its rules', () => {
    const beast = unit({
      size: 2,
      rules: [rule('Impact(3)'), rule('Ravage(4)'), rule('Takedown Strike(2)')],
      weapons: [weapon({ range: 24 })],
    })
    expect(specialAttacks(beast).map((w) => [w.name, w.attacks, w.count, w.range])).toEqual([
      ['Impact', 3, 2, 0],
      ['Ravage', 4, 2, 0],
      ['Takedown Strike', 2, 1, 0],
    ])
  })

  it('only offers Takedown Shot to units that can shoot, at their longest range', () => {
    expect(specialAttacks(unit({ rules: [rule('Takedown Shot(1)')] }))).toEqual([])
    const sniper = unit({ rules: [rule('Takedown Shot(1)')], weapons: [weapon({ range: 12 }), weapon({ range: 30 })] })
    expect(specialAttacks(sniper)[0]).toMatchObject({ name: 'Takedown Shot', range: 30 })
  })

  it('gives Heavy Impact AP(1)', () => {
    const [heavy] = specialAttacks(unit({ rules: [rule('Heavy Impact(2)')] }))
    expect(heavy.rules.map((r) => r.label)).toEqual(['AP(1)'])
  })
})

describe('special attacks in the engine', () => {
  const impact = (attacker = unit()) => specialAttacks({ ...attacker, rules: [...attacker.rules, rule('Impact(3)')] })[0]

  it('hits Impact on 2+ whatever the unit’s Quality and rules', () => {
    const clumsy = unit({ quality: 5, rules: [rule('Imprecise')] })
    const result = resolveAttack(attack({ attacker: clumsy, weapon: impact(clumsy), mode: 'melee', target: unit({ rules: [rule('Dodge')] }) }))
    expect(result).toMatchObject({ dice: 3, hitOn: 2, blockOn: 4 })
  })

  it('wounds on 6s with no Defense roll for Ravage, and still allows ignoring wounds', () => {
    const [ravage] = specialAttacks(unit({ rules: [rule('Ravage(6)')] }))
    const result = resolveAttack(attack({ weapon: ravage, mode: 'melee', target: unit({ defense: 2, rules: [rule('Regeneration')] }) }))
    expect(result).toMatchObject({ hitOn: 6, autoWound: true, ignoreWoundsOn: 5 })
    expect(result.estimate.wounds).toBeCloseTo(1 * (4 / 6))
    const rolled = rollAttack(result, { models: 1, tough: 1 }, faces(6, 6, 1, 2, 3, 4, 1, 6))
    expect(rolled.steps.map((s) => s.label)).toEqual(['Wound on 6+', 'Ignore on 5+'])
    expect(rolled.wounds).toBe(1)
  })

  it('makes Takedown attacks at Quality 2+ with AP(2) and Deadly(3)', () => {
    const [strike] = specialAttacks(unit({ rules: [rule('Takedown Strike(2)')] }))
    const result = resolveAttack(attack({ weapon: strike, mode: 'melee', target: unit({ tough: 3 }) }))
    expect(result).toMatchObject({ dice: 2, hitOn: 2, ap: 2, blockOn: 6, woundMultiplier: 3 })
  })
})
