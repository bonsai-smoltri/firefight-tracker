import type { ParsedList, ParsedUnit } from '../types/list'

export type Side = 'A' | 'B'

const LIST_KEYS: Record<Side, string> = { A: 'firefight-list-a', B: 'firefight-list-b' }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isUnit(v: unknown): v is ParsedUnit {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    [v.size, v.quality, v.defense, v.tough, v.points].every(isNumber) &&
    Array.isArray(v.rules) &&
    Array.isArray(v.weapons) &&
    v.weapons.every((w) => isObject(w) && typeof w.name === 'string' && isNumber(w.attacks) && isNumber(w.count))
  )
}

/** Stored data is validated on read; anything that doesn't fit is dropped rather than migrated. */
export function isParsedList(v: unknown): v is ParsedList {
  return (
    isObject(v) &&
    typeof v.name === 'string' &&
    isNumber(v.points) &&
    isObject(v.source) &&
    isObject(v.rules) &&
    Array.isArray(v.warnings) &&
    Array.isArray(v.listErrors) &&
    Array.isArray(v.units) &&
    v.units.every(isUnit)
  )
}

export function saveList(side: Side, list: ParsedList): void {
  try {
    localStorage.setItem(LIST_KEYS[side], JSON.stringify(list))
  } catch (e) {
    console.warn('Failed to save list:', e)
  }
}

export function loadList(side: Side): ParsedList | null {
  try {
    const data = localStorage.getItem(LIST_KEYS[side])
    if (!data) return null
    const parsed: unknown = JSON.parse(data)
    if (isParsedList(parsed)) return parsed
    localStorage.removeItem(LIST_KEYS[side])
  } catch (e) {
    console.warn('Failed to load list:', e)
  }
  return null
}

export function clearList(side: Side): void {
  localStorage.removeItem(LIST_KEYS[side])
}
