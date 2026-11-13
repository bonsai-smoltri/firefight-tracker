import { describe, expect, it } from 'vitest'
import { attackControls, defenseFaces, resolveAttack, weaponModes } from './engine.ts'
import { attack, rule, testContext, unit, weapon } from './fixtures.ts'
import { grantOptions } from './resolve.ts'

const gun = (attacks: number, ...rules: string[]) => weapon({ attacks, rules: rules.map(rule) })
const statusOf = (result: ReturnType<typeof resolveAttack>, label: string) =>
  result.rules.find((r) => r.label === label)?.status

describe('core thresholds', () => {
  it('hits on Quality and blocks on Defense with no rules', () => {
    const result = resolveAttack(attack({ weapon: gun(3) }))
    expect(result).toMatchObject({ dice: 3, hitOn: 4, blockOn: 4, ap: 0 })
    expect(result.estimate.hits).toBeCloseTo(1.5)
    expect(result.estimate.wounds).toBeCloseTo(0.75)
  })

  it('multiplies attacks by weapon copies, scaled to the copies still attacking', () => {
    expect(resolveAttack(attack({ weapon: weapon({ attacks: 2, count: 3 }) })).dice).toBe(6)
    expect(resolveAttack(attack({ weapon: weapon({ attacks: 2, count: 3 }), weaponCount: 1 })).dice).toBe(2)
  })

  it('applies AP to the block roll', () => {
    const result = resolveAttack(attack({ weapon: gun(3, 'AP(1)') }))
    expect(result.blockOn).toBe(5)
    expect(result.estimate.wounds).toBeCloseTo(1.5 * (4 / 6))
  })

  it('keeps 6s succeeding and 1s failing whatever the modifiers', () => {
    const hard = resolveAttack(attack({ attacker: unit({ quality: 6 }), weapon: gun(1, 'Imprecise', 'AP(4)') }))
    expect(hard).toMatchObject({ hitOn: 6, blockOn: 6 })
    const easy = resolveAttack(attack({ attacker: unit({ quality: 2, rules: [rule('Precise')] }), target: unit({ defense: 2 }) }))
    expect(easy).toMatchObject({ hitOn: 2, blockOn: 2 })
  })

  it('melee while Fatigued only hits on unmodified 6s, which lose their special rules', () => {
    const result = resolveAttack(
      attack({ mode: 'melee', weapon: gun(6, 'Rending', 'Surge'), situation: { attackerFatigued: true } }),
    )
    expect(result).toMatchObject({ hitOn: 6, onlySixes: true, extraHitsOnSix: 0, blockOnSix: null })
    expect(result.estimate.hits).toBeCloseTo(1)
  })
})

describe('hit rules', () => {
  it('Reliable attacks at Quality 2+, then modifiers apply', () => {
    expect(resolveAttack(attack({ weapon: gun(1, 'Reliable', 'Imprecise') })).hitOn).toBe(3)
  })

  it('Stealth only counts when shot from over 9"', () => {
    const target = unit({ rules: [rule('Stealth')] })
    expect(resolveAttack(attack({ target })).hitOn).toBe(4)
    expect(resolveAttack(attack({ target, situation: { overNine: true } })).hitOn).toBe(5)
    expect(resolveAttack(attack({ target, mode: 'melee', situation: { overNine: true } })).hitOn).toBe(4)
  })

  it('Unstoppable ignores the target’s penalties but not the attacker’s own', () => {
    const target = unit({ rules: [rule('Stealth'), rule('Fortified')] })
    const result = resolveAttack(attack({ target, weapon: gun(1, 'Unstoppable', 'Imprecise', 'AP(1)'), situation: { overNine: true } }))
    expect(result).toMatchObject({ hitOn: 5, ap: 1 })
  })

  it('Artillery helps when holding at long range, and hinders shooters at a stationary one', () => {
    const artillery = unit({ rules: [rule('Artillery')] })
    expect(resolveAttack(attack({ attacker: artillery, situation: { attackerHeld: true, overTwelve: true } })).hitOn).toBe(3)
    expect(resolveAttack(attack({ target: artillery, situation: { targetStationary: true, overTwelve: true } })).hitOn).toBe(5)
  })

  it('Surge adds a hit per 6 at normal AP', () => {
    const result = resolveAttack(attack({ weapon: gun(6, 'Surge') }))
    expect(result.estimate.hits).toBeCloseTo(4)
  })

  it('Predator adds attacks on 6s that do not chain', () => {
    const result = resolveAttack(attack({ attacker: unit({ rules: [rule('Predator')] }), weapon: gun(6) }))
    expect(result.estimate.hits).toBeCloseTo(7 * 0.5)
  })

  it('Enhanced Predator replaces Predator and triggers on 5–6', () => {
    const attacker = unit({ rules: [rule('Predator'), rule('Enhanced Predator')] })
    const result = resolveAttack(attack({ attacker, weapon: gun(6) }))
    expect(result.extraAttacks).toEqual({ count: 1, on: 5 })
    expect(statusOf(result, 'Predator')).toBe('replaced')
    expect(result.estimate.hits).toBeCloseTo(6 * (1 + 2 / 6) * 0.5)
  })

  it('Enhanced rules do nothing without their base rule', () => {
    const result = resolveAttack(attack({ attacker: unit({ rules: [rule('Enhanced Predator')] }), weapon: gun(6) }))
    expect(result.extraAttacks).toBeNull()
    expect(statusOf(result, 'Enhanced Predator')).toBe('inactive')
  })

  it('Thrust and Furious only apply when charging in melee', () => {
    const weaponRules = gun(6, 'Thrust', 'Furious')
    expect(resolveAttack(attack({ mode: 'melee', weapon: weaponRules })).hitOn).toBe(4)
    const charging = resolveAttack(attack({ mode: 'melee', weapon: weaponRules, situation: { charging: true } }))
    expect(charging).toMatchObject({ hitOn: 3, ap: 1, extraHitsOnSix: 1 })
  })
})

describe('defense rules', () => {
  it('Cover gives +1 Defense against shooting, unless the weapon ignores cover', () => {
    expect(resolveAttack(attack({ situation: { targetInCover: true } })).blockOn).toBe(3)
    expect(resolveAttack(attack({ mode: 'melee', situation: { targetInCover: true } })).blockOn).toBe(4)
    expect(resolveAttack(attack({ weapon: gun(1, 'Anti-Cover'), situation: { targetInCover: true } })).blockOn).toBe(4)
    expect(resolveAttack(attack({ weapon: gun(1, 'Blast(3)'), situation: { targetInCover: true } })).blockOn).toBe(4)
  })

  it('Armor sets Defense, and Defense(X) improves the roll', () => {
    expect(resolveAttack(attack({ target: unit({ defense: 5, rules: [rule('Armor(2)')] }), weapon: gun(1, 'AP(1)') })).blockOn).toBe(3)
    expect(resolveAttack(attack({ target: unit({ rules: [rule('Defense(1)')] }) })).blockOn).toBe(3)
  })

  it('Fortified removes 1 AP, to a minimum of 0', () => {
    const target = unit({ rules: [rule('Fortified')] })
    expect(resolveAttack(attack({ target, weapon: gun(1, 'AP(2)') })).ap).toBe(1)
    expect(resolveAttack(attack({ target })).ap).toBe(0)
  })

  it('Fragment only re-rolls against Defense 4+ to 6+, after Armor', () => {
    const fragment = gun(1, 'Fragment')
    expect(resolveAttack(attack({ weapon: fragment })).rerollDefenseFrom).toBe(4)
    expect(resolveAttack(attack({ weapon: fragment, target: unit({ defense: 3 }) })).rerollDefenseFrom).toBeNull()
    expect(resolveAttack(attack({ weapon: fragment, target: unit({ rules: [rule('Armor(3)')] }) })).rerollDefenseFrom).toBeNull()
  })

  it('Bane makes the target re-roll Defense 6s', () => {
    const faces = defenseFaces(4, 6)
    expect(faces[4] + faces[5] + faces[6]).toBeCloseTo(2 / 6 + (1 / 6) * (3 / 6))
    const result = resolveAttack(attack({ weapon: gun(6, 'Bane') }))
    expect(result.estimate.wounds).toBeCloseTo(3 * (1 - 5 / 12))
  })

  it('Rending hits from 6s block at +4 AP', () => {
    const result = resolveAttack(attack({ target: unit({ defense: 2 }), weapon: gun(6, 'Rending') }))
    expect(result).toMatchObject({ blockOn: 2, blockOnSix: 6 })
    expect(result.estimate.wounds).toBeCloseTo(1 * (5 / 6) + 2 * (1 / 6))
  })

  it('Shred adds a wound per 1 to block', () => {
    const result = resolveAttack(attack({ weapon: gun(6, 'Shred') }))
    expect(result.estimate.wounds).toBeCloseTo(3 * (0.5 + 1 / 6))
  })
})

describe('wound rules', () => {
  it('Deadly multiplies each wound up to the model’s Tough', () => {
    expect(resolveAttack(attack({ weapon: gun(6, 'Deadly(2)'), target: unit({ tough: 3 }) })).estimate.wounds).toBeCloseTo(1.5 * 2)
    expect(resolveAttack(attack({ weapon: gun(6, 'Deadly(2)') })).estimate.wounds).toBeCloseTo(1.5)
  })

  it('Regeneration ignores wounds on 5+, unless the weapon ignores Regeneration', () => {
    const target = unit({ rules: [rule('Regeneration')] })
    expect(resolveAttack(attack({ target, weapon: gun(6) })).estimate.wounds).toBeCloseTo(1.5 * (4 / 6))
    expect(resolveAttack(attack({ target, weapon: gun(6, 'Bane') })).ignoreWoundsOn).toBeNull()
  })

  it('Bane does not ignore Self-Repair, which is not Regeneration', () => {
    const target = unit({ rules: [rule('Self-Repair')] })
    expect(resolveAttack(attack({ target, weapon: gun(6, 'Bane') })).ignoreWoundsOn).toBe(6)
  })

  it('Enhanced Self-Repair ignores on 5+', () => {
    const target = unit({ rules: [rule('Self-Repair'), rule('Enhanced Self-Repair')] })
    expect(resolveAttack(attack({ target })).ignoreWoundsOn).toBe(5)
  })

  it('Protection Feat only applies when switched on', () => {
    const target = unit({ rules: [rule('Protection Feat')] })
    const off = resolveAttack(attack({ target }))
    expect(off.ignoreWoundsOn).toBeNull()
    expect(statusOf(off, 'Protection Feat')).toBe('manual')
    expect(resolveAttack(attack({ target, manual: ['Protection Feat'] })).ignoreWoundsOn).toBe(5)
  })
})

describe('Blast', () => {
  it('multiplies hits, capped at the models in the target', () => {
    const attacker = unit({ quality: 3 })
    const blast = gun(2, 'Blast(3)')
    expect(resolveAttack(attack({ attacker, weapon: blast, target: unit({ size: 10 }) })).estimate.hits).toBeCloseTo(4)
    // Two attacks hitting on 3+: at least one hit 8/9 of the time, and one model can take one hit.
    expect(resolveAttack(attack({ attacker, weapon: blast })).estimate.hits).toBeCloseTo(8 / 9)
    expect(resolveAttack(attack({ attacker, weapon: blast, targetModels: 2, target: unit({ size: 5 }) })).estimate.hits).toBeCloseTo(
      (4 / 9) * 2 + (4 / 9) * 2,
    )
  })
})

describe('resolution', () => {
  it('follows declared aliases', () => {
    const result = resolveAttack(attack({ attacker: unit({ rules: [rule('Berserker')] }), situation: { overNine: true } }))
    expect(result.extraHitsOnSix).toBe(1)
    expect(result.rules[0]).toMatchObject({ label: 'Berserker', resolvedAs: 'Brutal', status: 'applied' })
  })

  it('applies "in Melee" and "when Shooting" wrappers only in that mode', () => {
    const attacker = unit({ rules: [rule('Rending in Melee')] })
    expect(resolveAttack(attack({ attacker, mode: 'melee', target: unit({ defense: 2 }) })).blockOnSix).toBe(6)
    expect(resolveAttack(attack({ attacker })).blockOnSix).toBeNull()
  })

  it('applies an Aura to its holder, and a Buff only to the units it is given to', () => {
    expect(resolveAttack(attack({ target: unit({ rules: [rule('Stealth Aura')] }), situation: { overNine: true } })).hitOn).toBe(5)
    const buffHolder = resolveAttack(attack({ target: unit({ rules: [rule('Stealth Buff')] }), situation: { overNine: true } }))
    expect(buffHolder.hitOn).toBe(4)
    expect(statusOf(buffHolder, 'Stealth Buff')).toBe('grant')
    const buffed = resolveAttack(attack({ granted: { target: [rule('Stealth')] }, situation: { overNine: true } }))
    expect(buffed.hitOn).toBe(5)
  })

  it('counts the same rule once however many sources give it', () => {
    const attacker = unit({ rules: [rule('Rending in Melee')] })
    const result = resolveAttack(attack({ attacker, mode: 'melee', weapon: gun(1, 'Rending'), target: unit({ defense: 2 }) }))
    expect(result.blockOnSix).toBe(6)
    expect(result.rules.filter((r) => r.status === 'applied')).toHaveLength(1)
  })

  it('skips a mapping when the list’s version of the rule has unreviewed text', () => {
    const blast = { ...rule('Blast(3)'), id: 'other-blast' }
    const result = resolveAttack(
      attack({
        weapon: weapon({ rules: [blast] }),
        target: unit({ size: 10 }),
        ruleTexts: { 'other-blast': { name: 'Blast', description: 'Different wording.', aliasedRuleId: null } },
      }),
    )
    expect(result.blast).toBe(1)
    expect(statusOf(result, 'Blast(3)')).toBe('unreviewed')
  })

  it('lists the Buffs and Marks an army can give, without Debuffs or duplicates', () => {
    const refs = ['Stealth Buff', 'Stealth Buff', 'Defense Debuff', 'Rending in Melee Buff', 'Hero', 'Mystery Buff'].map(rule)
    expect(grantOptions(refs, testContext).map((o) => [o.label, o.rule.name])).toEqual([
      ['Stealth Buff', 'Stealth'],
      ['Rending in Melee Buff', 'Rending in Melee'],
    ])
  })

  it('reports text-only and unmapped rules without changing the maths', () => {
    const result = resolveAttack(attack({ attacker: unit({ rules: [rule('Hero'), rule('Mystery Rule')] }) }))
    expect(result.hitOn).toBe(4)
    expect(statusOf(result, 'Hero')).toBe('text')
    expect(statusOf(result, 'Mystery Rule')).toBe('unmapped')
  })
})

describe('attackControls', () => {
  const controls = (overrides: Parameters<typeof attack>[0]) => {
    const { attacker, weapon: w, target, mode, context, granted } = attack(overrides)
    return attackControls({ attacker, weapon: w, target, mode, context, granted })
  }

  it('always offers cover for shooting and charging and fatigue for melee', () => {
    expect(controls({})).toEqual({ situations: ['targetInCover'], manual: [] })
    expect(controls({ mode: 'melee' }).situations).toEqual(['charging', 'attackerFatigued'])
  })

  it('adds the toggles that rules in play care about, for this mode only', () => {
    const target = unit({ rules: [rule('Stealth'), rule('Entrenched')] })
    expect(controls({ target }).situations).toEqual(['overNine', 'overTwelve', 'targetInCover', 'targetStationary'])
    expect(controls({ target, mode: 'melee' }).situations).toEqual(['charging', 'attackerFatigued'])
    expect(controls({ attacker: unit({ rules: [rule('Brutal')] }), mode: 'melee' }).situations).toEqual([
      'charging',
      'chargeOverSix',
      'attackerFatigued',
    ])
  })

  it('lists manual rules', () => {
    expect(controls({ target: unit({ rules: [rule('Protection Feat')] }) }).manual).toEqual(['Protection Feat'])
  })
})

describe('weaponModes', () => {
  it('reads range 0 as melee and Assault as both', () => {
    expect(weaponModes(weapon({ range: 0 }))).toEqual(['melee'])
    expect(weaponModes(weapon({ range: 24 }))).toEqual(['shooting'])
    expect(weaponModes(weapon({ range: 12, rules: [rule('Assault')] }))).toEqual(['shooting', 'melee'])
  })
})
