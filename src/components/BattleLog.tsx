import type { BattleState, LogEntry } from '../types/battle'

const ACTION_LABEL = { hold: 'Hold', advance: 'Advance', rush: 'Rush', charge: 'Charge', idle: 'Idle' } as const

export function describeEntry(state: BattleState, entry: LogEntry): string {
  const name = (key: string) => state.units[key]?.name ?? key
  switch (entry.type) {
    case 'activation':
      return `${name(entry.unit)} activates: ${ACTION_LABEL[entry.action]}`
    case 'attack':
      return `${name(entry.attacker)} ${entry.strikeBack ? 'strikes back at' : entry.mode === 'melee' ? 'fights' : 'shoots'} ${name(entry.target)} with ${entry.weapon}: ${entry.wounds} wound${entry.wounds === 1 ? '' : 's'}, ${entry.modelsLeft} model${entry.modelsLeft === 1 ? '' : 's'} left`
    case 'wounds':
      return `${name(entry.unit)} wounds set ${entry.from} → ${entry.to}`
    case 'morale':
      return `${name(entry.unit)} ${entry.reason === 'melee' ? 'lost the melee' : 'morale test'}: ${entry.result}`
    case 'round': {
      const held = (p: 'A' | 'B') => entry.objectives.filter((o) => o === p).length
      return `End of round ${entry.round}: ${state.listNames.A} ${held('A')}, ${state.listNames.B} ${held('B')} objectives`
    }
  }
}

export function BattleLog({ state, open = false }: { state: BattleState; open?: boolean }) {
  const rounds = [...new Set(state.log.map((e) => e.round))]
  return (
    <details class="collapse collapse-arrow bg-base-200" open={open}>
      <summary class="collapse-title min-h-11 text-sm font-medium">Battle log ({state.log.length})</summary>
      <div class="collapse-content flex flex-col gap-3">
        {state.log.length === 0 && <p class="text-sm opacity-70">Nothing yet.</p>}
        {rounds.map((round) => (
          <div key={round}>
            <h3 class="text-xs font-semibold opacity-70 pb-1">Round {round}</h3>
            <ol class="flex flex-col gap-1 text-sm">
              {state.log
                .filter((e) => e.round === round)
                .map((entry, i) => (
                  <li key={i} class={entry.type === 'activation' ? 'font-medium pt-1' : 'opacity-80 pl-3'}>
                    {describeEntry(state, entry)}
                  </li>
                ))}
            </ol>
          </div>
        ))}
      </div>
    </details>
  )
}
