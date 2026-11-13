import { useState } from 'preact/hooks'
import { PLAYERS, unitKey } from '../lib/battle'
import type { AuraAssignment, Player } from '../types/battle'
import type { ParsedList } from '../types/list'
import { Stepper } from './Stepper'

interface Props {
  lists: Record<Player, ParsedList>
  onStart: (setup: { firstPlayer: Player; objectiveCount: number; auras: AuraAssignment[] }) => void
  onCancel: () => void
}

const MAX_AURA_RECIPIENTS = 2

export function BattleSetup({ lists, onStart, onCancel }: Props) {
  const [firstPlayer, setFirstPlayer] = useState<Player>('A')
  const [objectiveCount, setObjectiveCount] = useState(4)
  const [auras, setAuras] = useState<AuraAssignment[]>(() =>
    PLAYERS.flatMap((player) =>
      lists[player].units.flatMap((u) =>
        u.rules
          .filter((r) => r.name.endsWith(' Aura'))
          .map((r) => ({ holder: unitKey(player, u.id), rule: r.name, rating: r.rating, recipients: [unitKey(player, u.id)] })),
      ),
    ),
  )

  const unitLabel = (key: string) => {
    const [player, id] = key.split(':') as [Player, string]
    const u = lists[player].units.find((x) => x.id === id)
    return u ? (u.customName ?? u.name) : key
  }

  const toggleRecipient = (index: number, key: string) => {
    setAuras(
      auras.map((a, i) => {
        if (i !== index) return a
        const extra = a.recipients.filter((r) => r !== a.holder)
        if (extra.includes(key)) return { ...a, recipients: a.recipients.filter((r) => r !== key) }
        if (extra.length >= MAX_AURA_RECIPIENTS) return a
        return { ...a, recipients: [...a.recipients, key] }
      }),
    )
  }

  return (
    <main class="min-h-dvh pt-safe pb-safe px-4 max-w-xl mx-auto flex flex-col gap-4">
      <div class="flex items-center gap-2 pt-4">
        <button type="button" class="btn btn-ghost h-11 min-h-11" onClick={onCancel}>
          ← Lists
        </button>
        <h1 class="text-xl font-bold">New battle</h1>
      </div>

      <section class="card bg-base-200">
        <div class="card-body p-4 gap-3">
          <h2 class="font-semibold">Who activates first?</h2>
          <p class="text-xs opacity-70">The player who won the deployment roll-off.</p>
          <div class="join w-full" role="radiogroup" aria-label="First player">
            {PLAYERS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={firstPlayer === p}
                class={`btn join-item flex-1 h-11 ${firstPlayer === p ? 'btn-primary' : ''}`}
                onClick={() => setFirstPlayer(p)}
              >
                {lists[p].name}
              </button>
            ))}
          </div>
          <Stepper label="Objective markers" hint="D3+2" value={objectiveCount} onChange={setObjectiveCount} min={3} max={5} />
        </div>
      </section>

      {auras.length > 0 && (
        <section class="card bg-base-200">
          <div class="card-body p-4 gap-3">
            <h2 class="font-semibold">Auras</h2>
            <p class="text-xs opacity-70">
              Each Aura covers its own unit plus up to {MAX_AURA_RECIPIENTS} friendly units picked now.
            </p>
            {auras.map((aura, index) => {
              const player = aura.holder.split(':')[0] as Player
              const extra = aura.recipients.filter((r) => r !== aura.holder)
              return (
                <fieldset key={`${aura.holder}-${aura.rule}`} class="flex flex-col gap-1">
                  <legend class="text-sm font-medium">
                    {aura.rule} <span class="opacity-70 font-normal">· {unitLabel(aura.holder)}</span>
                  </legend>
                  <div class="flex flex-wrap gap-2 pt-1">
                    {lists[player].units
                      .map((u) => unitKey(player, u.id))
                      .filter((key) => key !== aura.holder)
                      .map((key) => {
                        const on = extra.includes(key)
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={on}
                            disabled={!on && extra.length >= MAX_AURA_RECIPIENTS}
                            class={`btn btn-sm h-9 min-h-9 ${on ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
                            onClick={() => toggleRecipient(index, key)}
                          >
                            {unitLabel(key)}
                          </button>
                        )
                      })}
                  </div>
                </fieldset>
              )
            })}
          </div>
        </section>
      )}

      <button type="button" class="btn btn-primary h-11" onClick={() => onStart({ firstPlayer, objectiveCount, auras })}>
        Start round 1
      </button>
    </main>
  )
}
