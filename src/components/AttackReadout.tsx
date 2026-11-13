import type { ResolvedAttack } from '../lib/rules/engine'

interface Props {
  attack: ResolvedAttack
  targetModels: number
  targetTough: number
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The attack as you'd say it at the table: final roll numbers only, every rule already folded in. */
export function AttackReadout({ attack, targetModels, targetTough }: Props) {
  const hitExtras = [
    attack.extraHitsOnSix > 0 && `+${attack.extraHitsOnSix} hit on 6s`,
    attack.extraAttacks && `+${attack.extraAttacks.count} attack on ${attack.extraAttacks.on === 6 ? '6s' : `${attack.extraAttacks.on}+`}`,
  ].filter(Boolean)

  const blockExtras = [
    attack.blockOnSix !== null && `hits from 6s block on ${attack.blockOnSix}+`,
    attack.rerollDefenseFrom !== null &&
      `re-roll successful ${attack.rerollDefenseFrom === 6 ? '6s' : `${attack.rerollDefenseFrom}+`}`,
    attack.extraWoundsOnOne > 0 && `1s deal +${attack.extraWoundsOnOne} wound`,
  ].filter(Boolean)

  const deadly = attack.woundMultiplier > 1 ? Math.min(attack.woundMultiplier, targetTough) : 1

  return (
    <div class="flex flex-col gap-1.5 font-mono text-sm" aria-label="Attack summary">
      <Line main={plural(attack.dice, attack.autoWound ? 'die' : 'attack').replace(/dies$/, 'dice')} />
      {attack.autoWound ? (
        <Line main={`Wound on ${attack.hitOn}+`} extra="no Defense roll" />
      ) : (
        <>
          <Line
            main={attack.onlySixes ? 'Hit on 6s only' : `Hit on ${attack.hitOn}+`}
            extra={[attack.onlySixes ? 'Fatigued, 6s trigger no rules' : null, ...hitExtras].filter(Boolean).join(', ')}
          />
          {attack.blast > 1 && <Line main={`Blast: hits ×${attack.blast}`} extra={`max ${plural(targetModels, 'hit')}`} />}
          {attack.parry > 0 && <Line main={`Parry: ${attack.parry} per model`} extra="each 6 ignores a hit" />}
          <Line
            main={`Block on ${attack.blockOn}+`}
            extra={[`Defense ${attack.defense}+${attack.ap ? `, AP ${attack.ap}` : ''}`, ...blockExtras].join(', ')}
          />
        </>
      )}
      {deadly > 1 && <Line main={`Each wound ×${deadly}`} extra={`Deadly(${attack.woundMultiplier})`} />}
      {attack.ignoreWoundsOn !== null && <Line main={`Ignore wounds on ${attack.ignoreWoundsOn}+`} />}
      <div class="border-t border-base-content/10 pt-2 mt-1 flex items-baseline justify-between">
        <span class="opacity-70 font-sans text-xs">Expected</span>
        <span>
          <span class="text-lg font-bold">≈ {attack.estimate.wounds.toFixed(1)}</span>{' '}
          <span class="text-xs opacity-70">wounds from ≈ {attack.estimate.hits.toFixed(1)} hits</span>
        </span>
      </div>
    </div>
  )
}

function Line({ main, extra }: { main: string; extra?: string }) {
  return (
    <div>
      <span class="font-semibold">{main}</span>
      {extra && <span class="opacity-60 text-xs font-sans"> · {extra}</span>}
    </div>
  )
}
