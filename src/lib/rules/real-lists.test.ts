import { describe, expect, it } from 'vitest'
import ruleIndex from '../../data/rule-index.json'
import type { RuleIndex } from '../../types/rules.ts'
import { defaultSituation } from '../../types/rules.ts'
import deathKorps from '../army-forge/fixtures/death-korps.json'
import robotLegions from '../army-forge/fixtures/robot-legions.json'
import { parseTtsList } from '../army-forge/tts.ts'
import { resolveAttack } from './engine.ts'
import { defaultContext } from './resolve.ts'

const robots = parseTtsList(robotLegions, 'r', 'now')
const korps = parseTtsList(deathKorps, 'k', 'now')
const context = defaultContext(ruleIndex as RuleIndex)
const ruleTexts = { ...robots.rules, ...korps.rules }
const find = (units: typeof robots.units, name: string) => units.find((u) => u.name === name)!

describe('real lists', () => {
  it('has reviewed text for every mapped rule the lists use', () => {
    for (const attacker of [...robots.units, ...korps.units]) {
      for (const weapon of attacker.weapons) {
        const result = resolveAttack({
          attacker,
          weapon,
          target: attacker,
          mode: weapon.range > 0 ? 'shooting' : 'melee',
          situation: defaultSituation(),
          context,
          ruleTexts,
        })
        expect(result.rules.filter((r) => r.status === 'unreviewed').map((r) => r.label)).toEqual([])
      }
    }
  })

  it('Sniper rifle into Veterans: Reliable, AP(1) and Deadly(2) up to Tough 3', () => {
    const sniper = find(robots.units, 'Sniper')
    const result = resolveAttack({
      attacker: sniper,
      weapon: sniper.weapons[0],
      target: find(korps.units, 'Veterans'),
      mode: 'shooting',
      situation: defaultSituation(),
      context,
      ruleTexts,
    })
    expect(result).toMatchObject({ dice: 1, hitOn: 2, blockOn: 6, woundMultiplier: 2 })
    expect(result.estimate.wounds).toBeCloseTo((5 / 6) * (5 / 6) * 2)
  })

  it('Battle rifles into the Robot Lord: Armor(2) and Self-Repair', () => {
    const veterans = find(korps.units, 'Veterans')
    const result = resolveAttack({
      attacker: veterans,
      weapon: veterans.weapons[0],
      target: find(robots.units, 'Robot Lord'),
      mode: 'shooting',
      situation: defaultSituation(),
      context,
      ruleTexts,
    })
    expect(result).toMatchObject({ dice: 6, hitOn: 4, blockOn: 2, ignoreWoundsOn: 6 })
    expect(result.estimate.wounds).toBeCloseTo(6 * 0.5 * (1 / 6) * (5 / 6))
    expect(result.rules.find((r) => r.label === 'Hold the Line')?.status).toBe('text')
  })

  it('Doom Scythe in melee: Imprecise and AP(4)', () => {
    const guardian = find(robots.units, 'Guardian')
    const result = resolveAttack({
      attacker: guardian,
      weapon: guardian.weapons[0],
      target: find(korps.units, 'Veterans'),
      mode: 'melee',
      situation: defaultSituation(),
      context,
      ruleTexts,
    })
    expect(result).toMatchObject({ dice: 2, hitOn: 4, blockOn: 6, ap: 4 })
  })
})
