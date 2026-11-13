import type { BattleState, Player } from '../types/battle'
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

const BATTLE_KEY = 'firefight-battle'
const HISTORY_KEY = 'firefight-history'
export const MAX_HISTORY = 20

export function isBattleState(v: unknown): v is BattleState {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    isNumber(v.round) &&
    (v.turn === 'A' || v.turn === 'B') &&
    isObject(v.units) &&
    Object.values(v.units).every(
      (u) => isObject(u) && typeof u.key === 'string' && isNumber(u.wounds) && isNumber(u.size) && isNumber(u.tough),
    ) &&
    Array.isArray(v.objectives) &&
    Array.isArray(v.pendingMorale) &&
    Array.isArray(v.log) &&
    Array.isArray(v.auras) &&
    isObject(v.listNames)
  )
}

export function saveBattle(state: BattleState | null): void {
  try {
    if (state) localStorage.setItem(BATTLE_KEY, JSON.stringify(state))
    else localStorage.removeItem(BATTLE_KEY)
  } catch (e) {
    console.warn('Failed to save battle:', e)
  }
}

export function loadBattle(): BattleState | null {
  try {
    const data = localStorage.getItem(BATTLE_KEY)
    if (!data) return null
    const parsed: unknown = JSON.parse(data)
    if (isBattleState(parsed)) return parsed
    localStorage.removeItem(BATTLE_KEY)
  } catch (e) {
    console.warn('Failed to load battle:', e)
  }
  return null
}

export interface BattleRecord {
  savedAt: number
  winner: Player | 'draw' | null
  state: BattleState
}

export function loadHistory(): BattleRecord[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is BattleRecord => isObject(r) && isNumber(r.savedAt) && isBattleState(r.state)).slice(0, MAX_HISTORY)
  } catch (e) {
    console.warn('Failed to load battle history:', e)
    return []
  }
}

export function saveHistory(records: BattleRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)))
  } catch (e) {
    // Most likely the quota: keep the newest half rather than lose the battle just finished.
    console.warn('Failed to save battle history, trimming:', e)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY / 2)))
    } catch {
      /* give up rather than break the app */
    }
  }
}

const UNDO_KEY = 'firefight-undo'
/** Kept small, as each step is a whole battle state. */
export const MAX_UNDO = 20

/** Earlier states of the battle in progress, oldest first. Steps from another battle are dropped. */
export function loadUndo(battleId: string): BattleState[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UNDO_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is BattleState => isBattleState(s) && s.id === battleId).slice(-MAX_UNDO)
  } catch (e) {
    console.warn('Failed to load undo history:', e)
    return []
  }
}

export function saveUndo(states: BattleState[]): void {
  try {
    if (states.length) localStorage.setItem(UNDO_KEY, JSON.stringify(states.slice(-MAX_UNDO)))
    else localStorage.removeItem(UNDO_KEY)
  } catch (e) {
    // Most likely the quota: undo is a convenience, so keep fewer steps rather than fail.
    console.warn('Failed to save undo history, trimming:', e)
    try {
      localStorage.setItem(UNDO_KEY, JSON.stringify(states.slice(-5)))
    } catch {
      /* give up on persisting undo */
    }
  }
}
