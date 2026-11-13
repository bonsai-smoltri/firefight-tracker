import { describe, expect, it } from 'vitest'
import type { ActivationAction, BattleState } from '../types/battle'
import type { ParsedList } from '../types/list'
import { createBattle, endActivation, recordAttack, startActivation } from './battle'
import { rule, unit, weapon } from './rules/fixtures'
import { specialAttacks } from './rules/special'
import { attackPhase, weaponUse } from './weapon-use'

const list = (name: string, ...units: ReturnType<typeof unit>[]): ParsedList => ({
  source: { kind: 'share', shareId: name },
  name,
  points: 0,
  pointsLimit: null,
  units,
  rules: {},
  listErrors: [],
  warnings: [],
  importedAt: 'now',
})

const rifle = weapon({ name: 'Rifle', range: 24 })
const blade = weapon({ name: 'Blade', range: 0 })
const pistol = weapon({ name: 'Pistol', range: 12, rules: [rule('Assault')] })
const launcher = weapon({ name: 'Launcher', range: 30, rules: [rule('Limited')] })

const battle = (action: ActivationAction) =>
  startActivation(
    createBattle({
      lists: { A: list('A', unit({ id: 'a', weapons: [rifle, blade] })), B: list('B', unit({ id: 'b' })) },
      firstPlayer: 'A',
      objectiveCount: 3,
      auras: [],
      now: 1,
    }),
    'A:a',
    action,
  )

describe('attackPhase', () => {
  it('maps the activation action to shooting or melee', () => {
    expect(attackPhase(battle('hold'), { canShootAfterRush: false })).toBe('shooting')
    expect(attackPhase(battle('advance'), { canShootAfterRush: false })).toBe('shooting')
    expect(attackPhase(battle('charge'), { canShootAfterRush: false })).toBe('melee')
    expect(attackPhase(battle('rush'), { canShootAfterRush: false })).toBeNull()
    expect(attackPhase(battle('rush'), { canShootAfterRush: true })).toBe('shooting')
    expect(attackPhase(battle('hold'), { strikeBack: true, canShootAfterRush: false })).toBe('melee')
  })
})

describe('weaponUse', () => {
  it('greys out the wrong weapon type, and lets Assault weapons do both', () => {
    const shooting = battle('hold')
    expect(weaponUse(shooting, 'A:a', rifle, 'shooting').disabled).toBeNull()
    expect(weaponUse(shooting, 'A:a', blade, 'shooting').disabled).toBe('Melee only')
    expect(weaponUse(shooting, 'A:a', rifle, 'melee').disabled).toMatch(/not usable in melee/)
    expect(weaponUse(shooting, 'A:a', pistol, 'melee').disabled).toBeNull()
  })

  it('counts uses this activation only', () => {
    let state = battle('hold')
    state = recordAttack(state, { attacker: 'A:a', target: 'B:b', weapon: 'Rifle', mode: 'shooting', wounds: 0 })
    expect(weaponUse(state, 'A:a', rifle, 'shooting').usedThisActivation).toBe(1)
    state = startActivation(endActivation(endActivation(state)), 'B:b', 'hold')
    expect(weaponUse(state, 'A:a', rifle, 'shooting').usedThisActivation).toBe(0)
  })

  it('blocks Limited weapons once used in an earlier activation', () => {
    let state: BattleState = recordAttack(battle('hold'), { attacker: 'A:a', target: 'B:b', weapon: 'Launcher', mode: 'shooting', wounds: 0 })
    expect(weaponUse(state, 'A:a', launcher, 'shooting').disabled).toBeNull()
    state = { ...endActivation(state), log: [...state.log, { type: 'activation', round: 1, unit: 'B:b', action: 'hold' }] }
    expect(weaponUse(state, 'A:a', launcher, 'shooting').disabled).toMatch(/Once per game/)
  })

  it('stops Impact and Ravage while Fatigued', () => {
    const [impact] = specialAttacks(unit({ rules: [rule('Impact(2)')] }))
    const state = battle('charge')
    expect(weaponUse(state, 'A:a', impact, 'melee').disabled).toBeNull()
    const tired = { ...state, units: { ...state.units, 'A:a': { ...state.units['A:a'], fatigued: true } } }
    expect(weaponUse(tired, 'A:a', impact, 'melee').disabled).toBe('Not while Fatigued')
  })
})
