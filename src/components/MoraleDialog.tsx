import { useState } from 'preact/hooks'
import { rollD6 } from '../lib/rules/dice'
import type { PendingMorale, UnitState } from '../types/battle'
import type { RuleRef } from '../types/list'

interface Props {
  test: PendingMorale
  unit: UnitState
  /** Unit rules that mention Morale Tests, shown as reminders. */
  reminders: RuleRef[]
  onResolve: (passed: boolean) => void
}

/** Rolls of 6 always pass and 1s always fail; otherwise a Quality test. */
const passes = (face: number, quality: number) => face === 6 || (face !== 1 && face >= quality)

export function MoraleDialog({ test, unit, reminders, onResolve }: Props) {
  const [face, setFace] = useState<number | null>(null)
  const failure = test.routsOnFail ? 'Routs (removed as destroyed)' : 'Shaken'

  return (
    <dialog class="modal modal-open" aria-labelledby="morale-title">
      <div class="modal-box flex flex-col gap-3">
        <h2 id="morale-title" class="text-lg font-bold">
          Morale test: {unit.name}
        </h2>
        <p class="text-sm">
          {test.reason === 'melee' ? 'Lost the melee.' : 'Down to half or less from wounds.'} Pass on{' '}
          <span class="font-bold">{unit.quality}+</span>, or a Hero within 6"'s Quality.
        </p>
        <p class="text-sm">
          If failed: <span class="font-semibold">{failure}</span>
        </p>
        {reminders.length > 0 && (
          <p class="text-xs opacity-70">Check: {reminders.map((r) => r.label).join(', ')}</p>
        )}

        {face !== null && (
          <p class="text-sm" aria-live="polite">
            Rolled <span class="font-mono font-bold text-lg">{face}</span>: {passes(face, unit.quality) ? 'passed' : 'failed'}
          </p>
        )}

        <div class="grid grid-cols-3 gap-2">
          <button type="button" class="btn h-11" onClick={() => setFace(rollD6())}>
            Roll
          </button>
          <button type="button" class="btn btn-primary h-11" onClick={() => onResolve(true)}>
            Passed
          </button>
          <button type="button" class="btn btn-outline h-11" onClick={() => onResolve(false)}>
            Failed
          </button>
        </div>
      </div>
    </dialog>
  )
}
