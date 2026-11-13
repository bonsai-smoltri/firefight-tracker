import type { BattleState, UnitKey } from '../types/battle'
import type { ParsedWeapon } from '../types/list'
import type { AttackMode } from '../types/rules'
import { weaponModes } from './rules/engine'

/**
 * What kind of attack this activation allows. Hold and Advance shoot, Charge fights, a strike
 * back fights, Rush can't attack unless the unit may shoot after rushing (Quick Shot).
 */
export function attackPhase(
  state: BattleState,
  options: { strikeBack?: boolean; canShootAfterRush: boolean },
): AttackMode | null {
  if (options.strikeBack) return 'melee'
  switch (state.activation?.action) {
    case 'hold':
    case 'advance':
      return 'shooting'
    case 'rush':
      return options.canShootAfterRush ? 'shooting' : null
    case 'charge':
      return 'melee'
    default:
      return null
  }
}

/** Weapons and rule attacks usable once per game. */
const onceAGame = (weapon: ParsedWeapon) =>
  weapon.rules.some((r) => r.name === 'Limited') ||
  weapon.special?.rule === 'Takedown Shot' ||
  weapon.special?.rule === 'Takedown Strike'

export interface WeaponUse {
  /** Why it can't be used now, or null. */
  disabled: string | null
  /** Times applied with this weapon so far this activation. */
  usedThisActivation: number
}

export function weaponUse(
  state: BattleState,
  attacker: UnitKey,
  weapon: ParsedWeapon,
  phase: AttackMode | null,
): WeaponUse {
  const start = state.log.findLastIndex((e) => e.type === 'activation')
  const attacks = state.log.filter(
    (e): e is Extract<typeof e, { type: 'attack' }> => e.type === 'attack' && e.attacker === attacker && e.weapon === weapon.name,
  )
  const usedThisActivation = state.log
    .slice(start + 1)
    .filter((e) => e.type === 'attack' && e.attacker === attacker && e.weapon === weapon.name).length

  // Spells come with their own permission: they were just cast.
  if (weapon.special?.spell) return { disabled: null, usedThisActivation }

  let disabled: string | null = null
  if (phase === null) disabled = "Can't attack this activation"
  else if (!weaponModes(weapon).includes(phase)) disabled = phase === 'melee' ? 'Ranged weapon, not usable in melee' : 'Melee only'
  else if (weapon.special?.fixedRoll !== undefined && state.units[attacker]?.fatigued) disabled = 'Not while Fatigued'
  else if (onceAGame(weapon) && attacks.length > usedThisActivation) disabled = 'Once per game, already used'
  return { disabled, usedThisActivation }
}
