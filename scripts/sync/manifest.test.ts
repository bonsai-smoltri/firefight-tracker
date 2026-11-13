import { describe, expect, it } from 'vitest'
import type { ArmyBook, BookRule, CoreRules } from '../../src/types/army-book.ts'
import { buildManifest, diffManifests, hashText, looksStatChanging } from './manifest.ts'

const rule = (id: string, name: string, description: string, aliasedRuleId: string | null = null): BookRule => ({
  id,
  name,
  description,
  aliasedRuleId,
  hasRating: false,
})

const core: CoreRules = { gameSystem: 3, rules: [rule('c1', 'Stealth', 'Enemy units get -1 to hit rolls.')] }
const robots: ArmyBook = {
  uid: 'robots',
  name: 'Robot Legions',
  version: '3.6.0',
  rules: [rule('r1', 'Self-Repair', 'On a 6+ it is ignored.'), rule('c1', 'Stealth', 'Enemy units get -1 to hit rolls.')],
  spells: [],
}

describe('buildManifest', () => {
  it('records each rule once with every source it appears in', () => {
    const manifest = buildManifest(core, [robots], 'now')
    expect(manifest.rules.c1.sources).toEqual(['core', 'robots'])
    expect(manifest.rules.r1).toEqual({ name: 'Self-Repair', hash: hashText('On a 6+ it is ignored.'), sources: ['robots'] })
    expect(manifest.books.robots).toEqual({ name: 'Robot Legions', version: '3.6.0' })
  })
})

describe('diffManifests', () => {
  it('reports everything as new on first sync, with nothing removed', () => {
    const diff = diffManifests(null, buildManifest(core, [robots], 'now'))
    expect(diff.newBooks).toEqual(['robots'])
    expect(diff.newRules.map((r) => r.name).sort()).toEqual(['Self-Repair', 'Stealth'])
    expect(diff.removedRules).toEqual([])
  })

  it('flags reworded rules, version bumps, additions and removals', () => {
    const previous = buildManifest(core, [robots], 'before')
    const next = buildManifest(
      core,
      [
        {
          ...robots,
          version: '3.6.1',
          rules: [rule('r1', 'Self-Repair', 'On a 5+ it is ignored.'), rule('r2', 'Swift', 'Ignores Slow.')],
        },
      ],
      'after',
    )
    const diff = diffManifests(previous, next)
    expect(diff.updatedBooks).toEqual([{ uid: 'robots', from: '3.6.0', to: '3.6.1' }])
    expect(diff.changedRules.map((r) => r.name)).toEqual(['Self-Repair'])
    expect(diff.newRules.map((r) => r.name)).toEqual(['Swift'])
    expect(diff.removedRules).toEqual([])
  })

  it('reports rules that disappeared entirely', () => {
    const previous = buildManifest(core, [robots], 'before')
    const diff = diffManifests(previous, buildManifest(core, [{ ...robots, rules: [] }], 'after'))
    expect(diff.removedRules.map((r) => r.name)).toEqual(['Self-Repair'])
  })
})

describe('looksStatChanging', () => {
  it.each([
    ['Gets -1 to hit when attacking.', true],
    ['This model gets AP(+1) when charging.', true],
    ['When a unit takes wounds, roll one die for each. On a 6+ it is ignored.', true],
    ['Moves +2" when using Advance.', false],
    ['Gets +1 to Morale Test rolls.', false],
  ])('%s -> %s', (description, expected) => {
    expect(looksStatChanging(rule('x', 'X', description))).toBe(expected)
  })
})
