import { describe, expect, it } from 'vitest'
import robotLegions from './fixtures/robot-legions.json'
import deathKorps from './fixtures/death-korps.json'
import trenchGoons from './fixtures/trench-goons.json'
import { ListParseError, parseTtsList } from './tts'

const parse = (raw: unknown) => parseTtsList(raw, 'share-id', 'now')
const clone = (v: unknown): any => JSON.parse(JSON.stringify(v))

describe('parseTtsList — Robot Legions', () => {
  const list = parse(robotLegions)
  const lord = list.units.find((u) => u.name === 'Robot Lord')!

  it('reads list totals and keeps one entry per unit copy', () => {
    expect(list.name).toBe('Robot Legions GDFF 300pt')
    expect(list.points).toBe(810)
    expect(list.units).toHaveLength(8)
    expect(list.units.filter((u) => u.name === 'Sniper')).toHaveLength(2)
    expect(list.warnings).toEqual([])
  })

  it('reads stats, Tough and points including upgrades', () => {
    expect(lord).toMatchObject({ size: 1, quality: 3, defense: 3, tough: 9, points: 295, caster: null, joinedTo: null })
  })

  it('merges rules granted by upgrade items into the unit rules', () => {
    expect(lord.rules.map((r) => r.label)).toEqual([
      'Hero',
      'Slow',
      'Tough(9)',
      'Self-Repair',
      'Reanimation Aura',
      'Armor(2)',
      'Flying',
      'Swift',
    ])
  })

  it('uses the final loadout, not the base weapons', () => {
    expect(lord.weapons.map((w) => w.name)).toEqual(['Hand Weapon'])
    const sniper = list.units.find((u) => u.name === 'Sniper')!
    expect(sniper.weapons[0]).toMatchObject({ name: 'Reaper Sniper Rifle', range: 30, attacks: 1, count: 1 })
    expect(sniper.weapons[0].rules.map((r) => [r.name, r.rating])).toEqual([
      ['AP', 1],
      ['Deadly', 2],
      ['Reliable', null],
    ])
  })

  it('treats range 0 as melee', () => {
    const scorpion = list.units.find((u) => u.name === 'Tri-Scorpion')!
    expect(scorpion.weapons[0]).toMatchObject({ name: 'Dual Uranium Daggers', range: 0, attacks: 2 })
  })

  it('fills in rule ids Army Forge leaves off, by name', () => {
    const deadly = list.units.find((u) => u.name === 'Sniper')!.weapons[0].rules.find((r) => r.name === 'Deadly')!
    expect(list.rules[deadly.id]?.name).toBe('Deadly')
    expect(list.rules[deadly.id]?.description).toMatch(/multiply/)
  })

  it('warns when a rule has no id and no core rule of that name', () => {
    const raw = clone(robotLegions)
    raw.units[0].loadout[0].specialRules.push({ type: 'ArmyBookRule', name: 'Mystery', label: 'Mystery' })
    expect(parse(raw).warnings).toContain('No rule text for: Mystery')
  })

  it('keeps rule text for every rule the list uses', () => {
    const selfRepair = Object.values(list.rules).find((r) => r.name === 'Self-Repair')!
    expect(selfRepair.description).toMatch(/6\+/)
  })

  it("passes Army Forge's list-building errors through", () => {
    expect(list.listErrors).toContain('Points limit exceeded: 810/300')
  })
})

describe('parseTtsList — Death Korps', () => {
  const list = parse(deathKorps)

  it('uses the list size, not the army book default', () => {
    const veterans = list.units.find((u) => u.name === 'Veterans')!
    expect(veterans).toMatchObject({ size: 3, tough: 3 })
    expect(veterans.weapons.map((w) => [w.name, w.count])).toEqual([
      ['Battle Rifle', 3],
      ['Strike', 3],
    ])
  })

  it('reads Buff and Aura rules from upgrades', () => {
    const labels = list.units.flatMap((u) => u.rules.map((r) => r.name))
    expect(labels).toEqual(expect.arrayContaining(['Rapid Advance Buff', 'Entrenched Buff', 'Regeneration Aura']))
  })

  it('adds up to the Army Forge total', () => {
    expect(list.points).toBe(1225)
    expect(list.warnings).toEqual([])
  })

  it('keeps the unit type and the custom name apart', () => {
    expect(list.units[0]).toMatchObject({ name: 'Company Leader', customName: '1 - Death Korp Captain' })
    expect(list.units[1]).toMatchObject({ name: 'Veterans', customName: '2 - Death Korp Plasma' })
  })
})

describe('parseTtsList — Trench Goons', () => {
  const list = parse(trenchGoons)

  it('reads a list with mixed unit types and weapon rules', () => {
    expect(list.points).toBe(785)
    expect(list.warnings).toEqual([])
    const sniper = list.units.find((u) => u.name === 'Sniper')!
    expect(sniper).toMatchObject({ quality: 5, defense: 5, tough: 3 })
    expect(sniper.weapons[0].rules.map((r) => r.name)).toEqual(['Deadly', 'Reliable', 'Anti-Cover', 'Fracture'])
  })
})

describe('parseTtsList — joins and odd data', () => {
  it('keeps a join to a unit in the list and drops one to a missing unit', () => {
    const raw = clone(deathKorps)
    raw.units[0].joinToUnit = raw.units[1].selectionId
    raw.units[7].joinToUnit = 'missing'
    const list = parse(raw)
    expect(list.units[0].joinedTo).toBe(raw.units[1].selectionId)
    expect(list.units[7].joinedTo).toBeNull()
    expect(list.warnings).toEqual([`${raw.units[7].customName}: joined to a unit that isn't in the list, treated as separate`])
  })

  it('reads Caster(X) as spell tokens', () => {
    const raw = clone(robotLegions)
    raw.units[0].rules.push({ id: 'cast', name: 'Caster', rating: 2, label: 'Caster(2)' })
    expect(parse(raw).units[0].caster).toBe(2)
  })

  it('warns when unit points disagree with the list total', () => {
    const raw = clone(robotLegions)
    raw.listPoints = 1
    expect(parse(raw).warnings).toContain('Unit points add up to 810, but Army Forge says 1')
  })

  it('rejects other game systems and non-lists', () => {
    expect(() => parse({ ...robotLegions, gameSystem: 'gf' })).toThrow(ListParseError)
    expect(() => parse({ error: 'nope' })).toThrow(/doesn't look like/)
    expect(() => parse({ gameSystem: 'gff', units: [] })).toThrow(/no units/)
  })
})
