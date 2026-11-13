import { describe, expect, it } from 'vitest'
import { loadSpells } from './spells'

describe('loadSpells', () => {
  it('loads a bundled book’s spells, cheapest first', async () => {
    const spells = await loadSpells('4k5amkxoybdiqotm')
    expect(spells).toHaveLength(6)
    expect(spells.map((s) => s.threshold)).toEqual([...spells.map((s) => s.threshold)].sort((a, b) => a - b))
    expect(spells[0]).toMatchObject({ threshold: 1 })
  })

  it('returns nothing for an unknown book', async () => {
    expect(await loadSpells('missing')).toEqual([])
  })
})
