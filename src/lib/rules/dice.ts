import type { ResolvedAttack } from './engine.ts'

export type RollDie = () => number

export const rollD6: RollDie = () => 1 + Math.floor(Math.random() * 6)

export interface Die {
  face: number
  /** The die did what its step wanted (hit, blocked, ignored). */
  success: boolean
  /** Face before a re-roll, when the die was re-rolled. */
  rerolledFrom?: number
}

export interface RollStep {
  label: string
  dice: Die[]
  /** What the step produced, e.g. "4 hits". */
  result: string
}

export interface AttackRoll {
  steps: RollStep[]
  hits: number
  wounds: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface TargetInfo {
  models: number
  tough: number
}

/**
 * Rolls one attack through the same steps the estimate uses. Where the defender would choose
 * (Blast cap, Parry), hits from 6s with extra AP are dropped first.
 */
export function rollAttack(attack: ResolvedAttack, target: TargetInfo, roll: RollDie = rollD6): AttackRoll {
  const steps: RollStep[] = []
  const rollHits = (count: number, canSpawn: boolean) => {
    const dice: Die[] = []
    let normal = 0
    let six = 0
    let spawned = 0
    for (let i = 0; i < count; i++) {
      const face = roll()
      const hit = attack.onlySixes ? face === 6 : face >= attack.hitOn
      dice.push({ face, success: hit })
      if (!hit) continue
      if (face === 6 && !attack.onlySixes) {
        six++
        normal += attack.extraHitsOnSix
      } else {
        normal++
      }
      if (canSpawn && attack.extraAttacks && face >= attack.extraAttacks.on) spawned += attack.extraAttacks.count
    }
    return { dice, normal, six, spawned }
  }

  const first = rollHits(attack.dice, true)
  let normal = first.normal
  let six = first.six
  steps.push({ label: `Hit on ${attack.hitOn}+`, dice: first.dice, result: plural(first.dice.filter((d) => d.success).length, 'hit') })
  if (first.spawned > 0) {
    const extra = rollHits(first.spawned, false)
    normal += extra.normal
    six += extra.six
    steps.push({ label: 'Extra attacks', dice: extra.dice, result: plural(extra.dice.filter((d) => d.success).length, 'hit') })
  }
  // Hits from 6s only carry extra AP when something gives them it; otherwise they're ordinary hits.
  if (attack.blockOnSix === null) {
    normal += six
    six = 0
  }
  if (attack.extraHitsOnSix > 0 && first.dice.some((d) => d.face === 6)) {
    steps.push({ label: `+${attack.extraHitsOnSix} hit on 6s`, dice: [], result: `${normal + six} hits in total` })
  }

  const drop = (count: number) => {
    const fromSix = Math.min(six, count)
    six -= fromSix
    normal = Math.max(0, normal - (count - fromSix))
  }

  if (attack.blast > 1) {
    const multiplied = (normal + six) * attack.blast
    const capped = Math.min(multiplied, target.models)
    normal *= attack.blast
    six *= attack.blast
    drop(multiplied - capped)
    steps.push({
      label: `Blast(${attack.blast})`,
      dice: [],
      result: capped < multiplied ? `${capped} hits, capped at ${target.models} models` : plural(capped, 'hit'),
    })
  }

  if (attack.parry > 0 && normal + six > 0) {
    const dice = Array.from({ length: Math.min(normal + six, attack.parry * target.models) }, () => {
      const face = roll()
      return { face, success: face === 6 }
    })
    const ignored = dice.filter((d) => d.success).length
    drop(ignored)
    steps.push({ label: 'Parry on 6', dice, result: `${plural(ignored, 'hit')} ignored` })
  }

  const hits = normal + six
  let unblocked = 0
  let ones = 0
  const block = (count: number, blockOn: number) => {
    const dice: Die[] = []
    for (let i = 0; i < count; i++) {
      let face = roll()
      let rerolledFrom: number | undefined
      if (attack.rerollDefenseFrom !== null && face >= blockOn && face >= attack.rerollDefenseFrom) {
        rerolledFrom = face
        face = roll()
      }
      const blocked = face >= blockOn
      if (!blocked) unblocked++
      if (face === 1) ones++
      dice.push({ face, success: blocked, rerolledFrom })
    }
    return dice
  }
  if (normal > 0) {
    const dice = block(normal, attack.blockOn)
    steps.push({ label: `Block on ${attack.blockOn}+`, dice, result: `${plural(dice.filter((d) => !d.success).length, 'hit')} through` })
  }
  if (six > 0 && attack.blockOnSix !== null) {
    const dice = block(six, attack.blockOnSix)
    steps.push({ label: `Block 6s on ${attack.blockOnSix}+`, dice, result: `${plural(dice.filter((d) => !d.success).length, 'hit')} through` })
  }

  let wounds = unblocked + ones * attack.extraWoundsOnOne
  if (attack.extraWoundsOnOne > 0 && ones > 0) {
    steps.push({ label: `+${attack.extraWoundsOnOne} wound on 1s`, dice: [], result: plural(wounds, 'wound') })
  }
  if (attack.woundMultiplier > 1 && wounds > 0) {
    const each = Math.min(attack.woundMultiplier, target.tough)
    wounds *= each
    steps.push({ label: `Deadly(${attack.woundMultiplier})`, dice: [], result: `${plural(wounds, 'wound')} (×${each})` })
  }
  if (attack.ignoreWoundsOn !== null && wounds > 0) {
    const dice = Array.from({ length: wounds }, () => {
      const face = roll()
      return { face, success: face >= attack.ignoreWoundsOn! }
    })
    const ignored = dice.filter((d) => d.success).length
    wounds -= ignored
    steps.push({ label: `Ignore on ${attack.ignoreWoundsOn}+`, dice, result: `${plural(ignored, 'wound')} ignored` })
  }

  return { steps, hits, wounds }
}
