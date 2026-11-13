import { describe, expect, it } from 'vitest'
import type { BookSpell } from '../../types/army-book.ts'
import { rollAttack, type RollDie } from './dice.ts'
import { resolveAttack } from './engine.ts'
import { attack, rule, unit } from './fixtures.ts'
import { spellAttack } from './spell-attacks.ts'

const spell = (effect: string): BookSpell => ({ id: 's', name: 'Bolt', threshold: 1, effect })
const faces = (...values: number[]): RollDie => {
  let i = 0
  return () => values[i++]
}

describe('spellAttack', () => {
  it('reads hits, range and weapon rules from the effect text', () => {
    const bolt = spellAttack(spell('Pick one enemy unit within 18" in line of sight, which takes 6 hits with AP(2) and Pierce.'))
    expect(bolt).toMatchObject({ attacks: 6, range: 18, count: 1 })
    expect(bolt!.rules.map((r) => [r.name, r.rating])).toEqual([
      ['AP', 2],
      ['Pierce', null],
    ])
    expect(bolt!.special).toMatchObject({ autoHit: true, rollForSixes: false, spell: true, singleModel: false })
  })

  it('handles "each", single-model targets and rolling for 6s', () => {
    expect(spellAttack(spell('Pick up to two enemy units within 9", which take 4 hits each.'))!.attacks).toBe(4)
    expect(
      spellAttack(spell('Pick one enemy model within 24", which takes 1 hit with AP(4). This effect is resolved as if the target was a unit of [1].'))!
        .special?.singleModel,
    ).toBe(true)
    expect(
      spellAttack(spell('Pick one enemy unit within 12", which takes 3 hits with Surge. Roll as many dice as hits to see if "on rolls of 6" effects trigger.'))!
        .special?.rollForSixes,
    ).toBe(true)
  })

  it('ignores spells that don’t deal hits', () => {
    expect(spellAttack(spell('Pick up to two friendly units within 12", which get Rapid Advance once.'))).toBeNull()
  })
})

describe('spell attacks in the engine', () => {
  const bolt = spellAttack(spell('Pick one enemy unit within 18", which takes 6 hits with AP(1).'))!

  it('auto-hits, ignoring the caster’s rules and cover', () => {
    const caster = unit({ quality: 5, rules: [rule('Imprecise'), rule('Sergeant')] })
    const result = resolveAttack(attack({ attacker: caster, weapon: bolt, situation: { targetInCover: true } }))
    expect(result).toMatchObject({ dice: 6, autoHit: true, ap: 1, blockOn: 5 })
    expect(result.estimate.hits).toBeCloseTo(6)
  })

  it('only triggers "on 6s" rules when the spell rolls for them', () => {
    const surge = spellAttack(spell('Pick one enemy unit within 12", which takes 6 hits with Surge. Roll as many dice as hits to see if "on rolls of 6" effects trigger.'))!
    expect(resolveAttack(attack({ weapon: surge })).estimate.hits).toBeCloseTo(7)
    const plain = spellAttack(spell('Pick one enemy unit within 12", which takes 6 hits with Surge.'))!
    expect(resolveAttack(attack({ weapon: plain })).estimate.hits).toBeCloseTo(6)
  })

  it('applies better protection against spells', () => {
    expect(resolveAttack(attack({ weapon: bolt, target: unit({ rules: [rule('Shielded')] }) })).blockOn).toBe(5)
    expect(resolveAttack(attack({ target: unit({ rules: [rule('Shielded')] }) })).blockOn).toBe(3)
    expect(resolveAttack(attack({ weapon: bolt, target: unit({ rules: [rule('Spell Resistance')] }) })).ignoreWoundsOn).toBe(2)
    expect(resolveAttack(attack({ target: unit({ rules: [rule('Spell Resistance')] }) })).ignoreWoundsOn).toBe(6)
    expect(resolveAttack(attack({ weapon: bolt, target: unit({ rules: [rule('Warding')] }) })).ignoreWoundsOn).toBe(2)
  })

  it('rolls no hit dice for plain spell hits', () => {
    const result = rollAttack(resolveAttack(attack({ weapon: bolt })), { models: 1, tough: 1 }, faces(1, 2, 3, 4, 5, 6))
    expect(result.steps[0]).toMatchObject({ label: 'Automatic hits', dice: [], result: '6 hits' })
    expect(result.wounds).toBe(4)
  })
})
