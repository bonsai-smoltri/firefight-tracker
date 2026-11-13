import { describe, expect, it } from 'vitest'
import { firefightBooks, trimBook, trimCoreRules } from './army-forge.ts'

describe('trimBook', () => {
  it('keeps rules and spells, sorted by name, and drops everything else', () => {
    const book = trimBook({
      uid: 'robots',
      name: 'Robot Legions',
      versionString: '3.6.0',
      units: [{ name: 'Robot Lord' }],
      specialRules: [
        { id: 'r2', name: 'Swift', aliasedRuleId: null, description: 'Ignores Slow.', hasRating: false, coreType: null },
        { id: 'r1', name: 'Self-Repair', aliasedRuleId: 'p1', description: 'On a 6+ it is ignored.' },
      ],
      spells: [{ id: 's1', name: 'Gauss Bots', threshold: 1, cost: 5, effect: '3 hits with AP(1).', generation: {} }],
    })
    expect(book).toEqual({
      uid: 'robots',
      name: 'Robot Legions',
      version: '3.6.0',
      rules: [
        { id: 'r1', name: 'Self-Repair', aliasedRuleId: 'p1', description: 'On a 6+ it is ignored.', hasRating: false },
        { id: 'r2', name: 'Swift', aliasedRuleId: null, description: 'Ignores Slow.', hasRating: false },
      ],
      spells: [{ id: 's1', name: 'Gauss Bots', threshold: 1, effect: '3 hits with AP(1).' }],
    })
  })

  it('fails loudly when the shape changes', () => {
    expect(() => trimBook({ uid: 'x', name: 'X', versionString: '1', specialRules: 'nope' })).toThrow(/book rules/)
    expect(() => trimBook({ name: 'X' })).toThrow(/book uid/)
  })
})

describe('trimCoreRules', () => {
  it('tags the game system and normalises missing fields', () => {
    expect(trimCoreRules({ rules: [{ id: 'c1', name: 'AP', description: 'AP' }], traits: [] })).toEqual({
      gameSystem: 3,
      rules: [{ id: 'c1', name: 'AP', aliasedRuleId: null, description: 'AP', hasRating: false }],
    })
  })
})

describe('firefightBooks', () => {
  it('keeps only books enabled for Firefight', () => {
    const index = firefightBooks([
      { uid: 'b', name: 'Robot Legions', enabledGameSystems: [2, 3] },
      { uid: 'a', name: 'Fantasy Only', enabledGameSystems: [4] },
    ])
    expect(index.map((b) => b.uid)).toEqual(['b'])
  })
})
