import { describe, expect, it } from 'vitest'
import type { BattleState } from '../types/battle'
import type { ParsedList } from '../types/list'
import {
  atHalfOrLess,
  cancelActivation,
  createBattle,
  endActivation,
  endRound,
  grantedByAuras,
  meleeLoser,
  modelsLeft,
  recordAttack,
  resolveMorale,
  roundOver,
  setWounds,
  startActivation,
  winner,
} from './battle'
import { rule, unit } from './rules/fixtures'

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

const lists = {
  A: list('Robots', unit({ id: 'lord', name: 'Lord', tough: 6 }), unit({ id: 'squad', name: 'Squad', size: 4 })),
  B: list('Korps', unit({ id: 'vets', name: 'Veterans', size: 3, tough: 3, rules: [rule('Fear(1)')] })),
}

const start = (overrides: Partial<Parameters<typeof createBattle>[0]> = {}) =>
  createBattle({ lists, firstPlayer: 'A', objectiveCount: 3, auras: [], now: 1, ...overrides })

const shoot = (state: BattleState, attacker: string, target: string, wounds: number) =>
  recordAttack(state, { attacker, target, weapon: 'Gun', mode: 'shooting', wounds })

describe('unit health', () => {
  it('fills wounds one model at a time against Tough', () => {
    const state = setWounds(start(), 'B:vets', 4)
    expect(modelsLeft(state.units['B:vets'])).toBe(2)
    expect(atHalfOrLess(state.units['B:vets'])).toBe(false)
    expect(atHalfOrLess(setWounds(state, 'B:vets', 6).units['B:vets'])).toBe(true)
  })

  it('uses Tough for single-model units', () => {
    expect(atHalfOrLess(setWounds(start(), 'A:lord', 2).units['A:lord'])).toBe(false)
    expect(atHalfOrLess(setWounds(start(), 'A:lord', 3).units['A:lord'])).toBe(true)
  })

  it('caps wounds at what the unit has left', () => {
    const state = shoot(start(), 'A:squad', 'B:vets', 20)
    expect(state.units['B:vets'].wounds).toBe(9)
    expect(state.log.at(-1)).toMatchObject({ type: 'attack', wounds: 9, modelsLeft: 0 })
  })
})

describe('activations', () => {
  it('alternates turns and tracks who finished first', () => {
    let state = startActivation(start(), 'A:lord', 'hold')
    state = endActivation(state)
    expect(state).toMatchObject({ turn: 'B', activation: null })
    state = endActivation(startActivation(state, 'B:vets', 'advance'))
    expect(state.units['B:vets'].lastAction).toBe('advance')
    expect(state.finishedFirst).toBe('B')
    expect(state.turn).toBe('A')
    expect(state.units['B:vets'].moved).toBe(true)
    state = endActivation(startActivation(state, 'A:squad', 'hold'))
    expect(roundOver(state)).toBe(true)
  })

  it('ignores a second activation while one is open, and units already activated', () => {
    const state = startActivation(start(), 'A:lord', 'hold')
    expect(startActivation(state, 'A:squad', 'hold')).toBe(state)
    const done = endActivation(state)
    expect(startActivation(done, 'A:lord', 'hold')).toBe(done)
  })

  it('can cancel an activation before anything is recorded', () => {
    const state = startActivation(start(), 'A:lord', 'hold')
    expect(cancelActivation(state)).toMatchObject({ activation: null, log: [] })
    expect(cancelActivation(shoot(state, 'A:lord', 'B:vets', 1))).toMatchObject({ activation: { unit: 'A:lord' } })
  })

  it('recovers from Shaken by staying idle', () => {
    let state = start()
    state = { ...state, units: { ...state.units, 'A:lord': { ...state.units['A:lord'], shaken: true } } }
    state = endActivation(startActivation(state, 'A:lord', 'idle'))
    expect(state.units['A:lord'].shaken).toBe(false)
  })
})

describe('morale', () => {
  it('tests a unit left at half or less by shooting', () => {
    let state = startActivation(start(), 'A:squad', 'hold')
    state = endActivation(shoot(state, 'A:squad', 'B:vets', 6))
    expect(state.pendingMorale).toEqual([{ unit: 'B:vets', reason: 'wounds', routsOnFail: false }])
    expect(state.activation).not.toBeNull()
    state = resolveMorale(state, 'B:vets', false)
    expect(state.units['B:vets'].shaken).toBe(true)
    expect(state.activation).toBeNull()
    expect(state.log.at(-1)).toMatchObject({ type: 'morale', result: 'shaken' })
  })

  it('does not test a unit still above half', () => {
    const state = endActivation(shoot(startActivation(start(), 'A:squad', 'hold'), 'A:squad', 'B:vets', 3))
    expect(state.pendingMorale).toEqual([])
  })

  it('fails Shaken units automatically', () => {
    let state = start()
    state = { ...state, units: { ...state.units, 'B:vets': { ...state.units['B:vets'], shaken: true } } }
    state = endActivation(shoot(startActivation(state, 'A:squad', 'hold'), 'A:squad', 'B:vets', 6))
    expect(state.pendingMorale).toEqual([])
    expect(state.activation).toBeNull()
    expect(state.log.at(-1)).toMatchObject({ type: 'morale', result: 'shaken' })
  })

  it('makes the melee loser test, and routs it on a fail at half or less', () => {
    let state = startActivation(start(), 'A:squad', 'charge')
    state = recordAttack(state, { attacker: 'A:squad', target: 'B:vets', weapon: 'Claws', mode: 'melee', wounds: 6 })
    state = recordAttack(state, { attacker: 'B:vets', target: 'A:squad', weapon: 'Strike', mode: 'melee', wounds: 2, strikeBack: true })
    expect(state.activation?.melee).toEqual({ charger: 'A:squad', target: 'B:vets', struckBack: true })
    expect(meleeLoser(state)).toBe('B:vets')
    state = endActivation(state)
    expect(state.pendingMorale).toEqual([{ unit: 'B:vets', reason: 'melee', routsOnFail: true }])
    state = resolveMorale(state, 'B:vets', false)
    expect(state.units['B:vets'].routed).toBe(true)
    expect(modelsLeft(state.units['B:vets'])).toBe(0)
  })

  it('counts Fear when checking who won the melee', () => {
    let state = startActivation(start(), 'A:squad', 'charge')
    state = recordAttack(state, { attacker: 'A:squad', target: 'B:vets', weapon: 'Claws', mode: 'melee', wounds: 1 })
    state = recordAttack(state, { attacker: 'B:vets', target: 'A:squad', weapon: 'Strike', mode: 'melee', wounds: 1, strikeBack: true })
    expect(meleeLoser(state)).toBe('A:squad')
  })

  it('marks both sides Fatigued after a melee', () => {
    let state = startActivation(start(), 'A:squad', 'charge')
    state = recordAttack(state, { attacker: 'A:squad', target: 'B:vets', weapon: 'Claws', mode: 'melee', wounds: 0 })
    state = recordAttack(state, { attacker: 'B:vets', target: 'A:squad', weapon: 'Strike', mode: 'melee', wounds: 0, strikeBack: true })
    expect(state.units['A:squad'].fatigued).toBe(true)
    expect(state.units['B:vets'].fatigued).toBe(true)
  })

  it('has no loser on a draw', () => {
    let state = startActivation(start(), 'A:squad', 'charge')
    state = recordAttack(state, { attacker: 'A:squad', target: 'A:lord', weapon: 'Claws', mode: 'melee', wounds: 1 })
    state = recordAttack(state, { attacker: 'A:lord', target: 'A:squad', weapon: 'Strike', mode: 'melee', wounds: 1, strikeBack: true })
    expect(meleeLoser(state)).toBeNull()
  })
})

describe('rounds', () => {
  const playRound = (state: BattleState) => {
    let next = state
    for (const key of ['A:lord', 'B:vets', 'A:squad']) next = endActivation(startActivation(next, key, 'hold'))
    return next
  }

  it('resets units, adds spell tokens and lets whoever finished first go first', () => {
    const caster = { A: list('Robots', unit({ id: 'lord', caster: 2 }), unit({ id: 'squad' })), B: lists.B }
    let state = createBattle({ lists: caster, firstPlayer: 'A', objectiveCount: 3, auras: [], now: 1 })
    expect(state.units['A:lord'].spellTokens).toBe(2)
    state = playRound(state)
    state = endRound(state, ['A', null, 'B'])
    expect(state).toMatchObject({ round: 2, firstPlayer: 'B', turn: 'B', objectives: ['A', null, 'B'] })
    expect(state.units['A:lord']).toMatchObject({ activated: false, lastAction: null, spellTokens: 4 })
  })

  it('caps spell tokens at 6', () => {
    const caster = { A: list('Robots', unit({ id: 'lord', caster: 4 })), B: lists.B }
    let state = createBattle({ lists: caster, firstPlayer: 'A', objectiveCount: 3, auras: [], now: 1 })
    state = endActivation(startActivation(state, 'A:lord', 'hold'))
    state = endActivation(startActivation(state, 'B:vets', 'hold'))
    expect(endRound(state, [null, null, null]).units['A:lord'].spellTokens).toBe(6)
  })

  it('only ends a round once every unit has activated', () => {
    const state = start()
    expect(endRound(state, [null, null, null])).toBe(state)
  })

  it('completes after round 4 and picks the winner from objectives', () => {
    let state = start()
    for (let round = 1; round <= 4; round++) state = endRound(playRound(state), ['A', 'A', 'B'])
    expect(state.complete).toBe(true)
    expect(winner(state)).toBe('A')
  })
})

describe('auras', () => {
  it('gives the base rule to picked units while the holder is alive', () => {
    const auras = [{ holder: 'A:lord', rule: 'Stealth Aura', rating: null, recipients: ['A:squad'] }]
    const state = start({ auras })
    expect(grantedByAuras(state, 'A:squad')).toEqual([
      { id: '', name: 'Stealth', rating: null, label: 'Stealth Aura from Lord' },
    ])
    expect(grantedByAuras(setWounds(state, 'A:lord', 6), 'A:squad')).toEqual([])
  })
})
