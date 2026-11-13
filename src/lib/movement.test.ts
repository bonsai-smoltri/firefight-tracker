import { describe, expect, it } from 'vitest'
import { movement, movementGrants } from './movement'
import { rule, testContext } from './rules/fixtures'

const move = (...labels: string[]) => movement(labels.map(rule), {
  ...testContext,
  aliasOf: (name) => ({ Runner: 'Agile', 'Enhanced Runner': 'Enhanced Agile' })[name] ?? null,
})

describe('movement', () => {
  it('uses the core distances with no rules', () => {
    expect(move().moves).toMatchObject({ hold: 0, advance: 6, rush: 12, charge: 12 })
    expect(move().notes).toEqual(['Difficult terrain: max 6" total move'])
  })

  it('applies Slow and Fast', () => {
    expect(move('Slow').moves).toMatchObject({ advance: 4, rush: 8, charge: 8 })
    expect(move('Fast').moves).toMatchObject({ advance: 8, rush: 16, charge: 16 })
  })

  it('lets Swift ignore Slow', () => {
    const result = move('Slow', 'Swift')
    expect(result.moves.advance).toBe(6)
    expect(result.notes).toContain('Swift: ignores Slow')
  })

  it('stacks action-specific bonuses', () => {
    expect(move('Fast', 'Rapid Charge').moves).toMatchObject({ advance: 8, rush: 16, charge: 20 })
  })

  it('follows aliases and lets Enhanced replace its base', () => {
    expect(move('Runner').moves).toMatchObject({ advance: 7, rush: 14 })
    expect(move('Runner', 'Enhanced Runner').moves).toMatchObject({ advance: 8, rush: 16 })
    expect(move('Enhanced Runner').moves.advance).toBe(6)
  })

  it('counts Auras on their holder', () => {
    expect(move('Rapid Charge Aura').moves.charge).toBe(16)
  })

  it('describes terrain handling', () => {
    expect(move('Flying').notes[0]).toMatch(/^Flying/)
    expect(move('Strider').notes[0]).toMatch(/^Strider/)
  })

  it('restricts Immobile and Aircraft actions', () => {
    expect(move('Immobile').blocked).toEqual(['advance', 'rush', 'charge'])
    const aircraft = move('Aircraft')
    expect(aircraft.blocked).toEqual(['hold', 'rush', 'charge'])
    expect(aircraft.moves.advance).toBe(36)
  })

  it('offers the army’s movement Buffs and Marks only', () => {
    const refs = ['Rapid Advance Buff', 'Rapid Charge Mark', 'Stealth Buff', 'Defense Debuff'].map(rule)
    expect(movementGrants(refs, testContext).map((o) => o.rule.name)).toEqual(['Rapid Advance', 'Rapid Charge'])
    expect(move('Rapid Advance').moves.advance).toBe(10)
  })

  it('notes Quick Shot', () => {
    expect(move('Quick Shot').canShootAfterRush).toBe(true)
  })
})
