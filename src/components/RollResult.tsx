import type { AttackRoll, Die } from '../lib/rules/dice'

export function RollResult({ roll }: { roll: AttackRoll }) {
  return (
    <div class="flex flex-col gap-2" aria-live="polite">
      {roll.steps.map((step, i) => (
        <div key={i} class="flex flex-col gap-1">
          <div class="flex items-baseline justify-between gap-2 text-sm">
            <span class="opacity-70">{step.label}</span>
            <span class="font-medium">{step.result}</span>
          </div>
          {step.dice.length > 0 && (
            <div class="flex flex-wrap gap-1">
              {step.dice.map((die, j) => (
                <DieFace key={j} die={die} />
              ))}
            </div>
          )}
        </div>
      ))}
      <div class="border-t border-base-content/10 pt-2 flex items-baseline justify-between">
        <span class="text-sm opacity-70">Result</span>
        <span class="text-xl font-bold">
          {roll.wounds} wound{roll.wounds === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}

/** Successes are filled, failures outlined, so the split reads without relying on colour. */
function DieFace({ die }: { die: Die }) {
  const label = `${die.face}${die.rerolledFrom ? `, re-rolled from ${die.rerolledFrom}` : ''}, ${die.success ? 'success' : 'fail'}`
  return (
    <span
      class={`inline-flex items-center justify-center w-7 h-7 rounded font-mono text-sm ${
        die.success ? 'bg-base-content text-base-100 font-bold' : 'border border-base-content/40 opacity-70'
      }`}
      role="img"
      aria-label={label}
      title={label}
    >
      {die.face}
      {die.rerolledFrom && <sup aria-hidden="true">↻</sup>}
    </span>
  )
}
