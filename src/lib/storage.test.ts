import { beforeEach, describe, expect, it } from 'vitest'
import robotLegions from './army-forge/fixtures/robot-legions.json'
import { parseTtsList } from './army-forge/tts'
import { createBattle } from './battle'
import { MAX_UNDO, loadBattle, loadHistory, loadList, loadUndo, saveBattle, saveHistory, saveList, saveUndo } from './storage'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

describe('list storage', () => {
  beforeEach(() => store.clear())

  it('round-trips a parsed list per side', () => {
    const list = parseTtsList(robotLegions, 'id', 'now')
    saveList('A', list)
    expect(loadList('A')).toEqual(list)
    expect(loadList('B')).toBeNull()
  })

  it('drops stored data that no longer fits the shape', () => {
    store.set('firefight-list-a', JSON.stringify({ name: 'old', units: [{ name: 'x' }] }))
    expect(loadList('A')).toBeNull()
    expect(store.has('firefight-list-a')).toBe(false)
  })

  it('round-trips the battle in progress and drops one that no longer fits', () => {
    const list = parseTtsList(robotLegions, 'id', 'now')
    const battle = createBattle({ lists: { A: list, B: list }, firstPlayer: 'A', objectiveCount: 3, auras: [], now: 1 })
    saveBattle(battle)
    expect(loadBattle()).toEqual(battle)
    saveBattle(null)
    expect(loadBattle()).toBeNull()
    store.set('firefight-battle', JSON.stringify({ id: 'x', round: 1 }))
    expect(loadBattle()).toBeNull()
  })

  it('keeps valid history records only', () => {
    const list = parseTtsList(robotLegions, 'id', 'now')
    const state = createBattle({ lists: { A: list, B: list }, firstPlayer: 'A', objectiveCount: 3, auras: [], now: 1 })
    saveHistory([{ savedAt: 2, winner: 'A', state }])
    store.set('firefight-history', JSON.stringify([...JSON.parse(store.get('firefight-history')!), { savedAt: 'bad' }]))
    expect(loadHistory()).toEqual([{ savedAt: 2, winner: 'A', state }])
  })

  it('keeps undo steps for the current battle only, up to the limit', () => {
    const list = parseTtsList(robotLegions, 'id', 'now')
    const battle = createBattle({ lists: { A: list, B: list }, firstPlayer: 'A', objectiveCount: 3, auras: [], now: 1 })
    const other = { ...battle, id: 'other' }
    saveUndo([other, ...Array.from({ length: MAX_UNDO + 5 }, (_, round) => ({ ...battle, round }))])
    const steps = loadUndo(battle.id)
    expect(steps).toHaveLength(MAX_UNDO)
    expect(steps.every((s) => s.id === battle.id)).toBe(true)
    expect(steps.at(-1)?.round).toBe(MAX_UNDO + 4)
    saveUndo([])
    expect(store.has('firefight-undo')).toBe(false)
  })

  it('drops unreadable JSON', () => {
    store.set('firefight-list-b', '{not json')
    expect(loadList('B')).toBeNull()
  })
})
