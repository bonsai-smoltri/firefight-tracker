import { beforeEach, describe, expect, it } from 'vitest'
import robotLegions from './army-forge/fixtures/robot-legions.json'
import { parseTtsList } from './army-forge/tts'
import { loadList, saveList } from './storage'

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

  it('drops unreadable JSON', () => {
    store.set('firefight-list-b', '{not json')
    expect(loadList('B')).toBeNull()
  })
})
