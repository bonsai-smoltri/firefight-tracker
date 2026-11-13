import { describe, expect, it } from 'vitest'
import { rollAttack, type RollDie } from './dice.ts'
import { resolveAttack } from './engine.ts'
import { attack, rule, unit, weapon } from './fixtures.ts'

const faces = (...values: number[]): RollDie => {
  let i = 0
  return () => {
    if (i >= values.length) throw new Error('Ran out of dice')
    return values[i++]
  }
}
const gun = (attacks: number, ...rules: string[]) => weapon({ attacks, rules: rules.map(rule) })
const target = { models: 1, tough: 1 }

describe('rollAttack', () => {
  it('rolls hits, then blocks for each hit', () => {
    const resolved = resolveAttack(attack({ weapon: gun(3) }))
    const result = rollAttack(resolved, target, faces(6, 4, 1, 3, 5))
    expect(result).toMatchObject({ hits: 2, wounds: 1 })
    expect(result.steps.map((s) => s.label)).toEqual(['Hit on 4+', 'Block on 4+'])
    expect(result.steps[1].dice).toEqual([
      { face: 3, success: false, rerolledFrom: undefined },
      { face: 5, success: true, rerolledFrom: undefined },
    ])
  })

  it('blocks hits from 6s separately when they carry extra AP', () => {
    const resolved = resolveAttack(attack({ weapon: gun(2, 'Rending'), target: unit({ defense: 2 }) }))
    const result = rollAttack(resolved, target, faces(6, 4, 2, 5))
    expect(result.steps.map((s) => s.label)).toEqual(['Hit on 4+', 'Block on 2+', 'Block 6s on 6+'])
    expect(result.wounds).toBe(1)
  })

  it('adds Surge hits and Predator attacks, which do not chain', () => {
    const resolved = resolveAttack(attack({ attacker: unit({ rules: [rule('Predator')] }), weapon: gun(1, 'Surge') }))
    // Hit 6 -> extra hit and an extra attack; the extra attack rolls a 6 -> extra hit, no new attack.
    const result = rollAttack(resolved, target, faces(6, 6, 1, 1, 1, 1))
    expect(result.hits).toBe(4)
    expect(result.wounds).toBe(4)
  })

  it('caps Blast at the models in the target, dropping hits from 6s first', () => {
    const resolved = resolveAttack(attack({ weapon: gun(2, 'Blast(3)', 'Rending') }))
    const result = rollAttack(resolved, { models: 4, tough: 1 }, faces(6, 5, 1, 1, 1, 1))
    expect(result.hits).toBe(4)
    expect(result.steps.map((s) => s.label)).toEqual(['Hit on 4+', 'Blast(3)', 'Block on 4+', 'Block 6s on 6+'])
    expect(result.steps[1].result).toBe('4 hits, capped at 4 models')
    expect(result.steps[3].dice).toHaveLength(1)
  })

  it('re-rolls successful blocks for Bane and Fragment', () => {
    const resolved = resolveAttack(attack({ weapon: gun(1, 'Bane') }))
    const result = rollAttack(resolved, target, faces(4, 6, 2))
    expect(result.steps[1].dice).toEqual([{ face: 2, success: false, rerolledFrom: 6 }])
    expect(result.wounds).toBe(1)
  })

  it('adds Shred wounds on 1s, multiplies Deadly to Tough, then rolls to ignore', () => {
    const resolved = resolveAttack(
      attack({ weapon: gun(1, 'Shred', 'Deadly(3)'), target: unit({ tough: 2, rules: [rule('Regeneration')] }) }),
    )
    const result = rollAttack(resolved, { models: 1, tough: 2 }, faces(4, 1, 5, 2, 6, 1))
    expect(result.steps.map((s) => s.label)).toEqual([
      'Hit on 4+',
      'Block on 4+',
      '+1 wound on 1s',
      'Deadly(3)',
      'Ignore on 5+',
    ])
    expect(result.wounds).toBe(2)
  })

  it('only hits on 6s while Fatigued', () => {
    const resolved = resolveAttack(attack({ mode: 'melee', weapon: gun(3), situation: { attackerFatigued: true } }))
    expect(rollAttack(resolved, target, faces(5, 6, 4, 1)).hits).toBe(1)
  })
})
