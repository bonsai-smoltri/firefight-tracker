import type { ArmyBook, BookSpell } from '../types/army-book'

// Books are loaded on demand: there are 56 of them and a battle needs one or two.
const books = import.meta.glob<ArmyBook>('../data/books/*.json', { import: 'default' })
const cache = new Map<string, Promise<BookSpell[]>>()

/** Spells for an army book, cheapest first. Empty when the book isn't bundled. */
export function loadSpells(armyId: string): Promise<BookSpell[]> {
  if (!cache.has(armyId)) {
    const load = books[`../data/books/${armyId}.json`]
    cache.set(
      armyId,
      load
        ? load().then((book) => [...book.spells].sort((a, b) => a.threshold - b.threshold || a.name.localeCompare(b.name)))
        : Promise.resolve([]),
    )
  }
  return cache.get(armyId)!
}
