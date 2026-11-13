import { useState } from 'preact/hooks'
import { AttackScreen } from './components/AttackScreen'
import { ListSlot } from './components/ListSlot'
import { clearList, loadList, saveList, type Side } from './lib/storage'
import type { ParsedList } from './types/list'

type View = 'home' | 'attack'

export function App() {
  const [lists, setLists] = useState<Record<Side, ParsedList | null>>(() => ({ A: loadList('A'), B: loadList('B') }))
  const [view, setView] = useState<View>('home')

  const setList = (side: Side, list: ParsedList | null) => {
    if (list) saveList(side, list)
    else clearList(side)
    setLists((current) => ({ ...current, [side]: list }))
  }

  if (view === 'attack' && lists.A && lists.B) {
    return <AttackScreen lists={{ A: lists.A, B: lists.B }} onBack={() => setView('home')} />
  }

  return (
    <main class="min-h-dvh pt-safe pb-safe px-4 max-w-xl mx-auto flex flex-col gap-4">
      <h1 class="text-2xl font-bold pt-6">Firefight Tracker</h1>
      {(['A', 'B'] as const).map((side) => (
        <ListSlot
          key={side}
          label={side === 'A' ? 'Player 1' : 'Player 2'}
          list={lists[side]}
          onImported={(list) => setList(side, list)}
          onClear={() => setList(side, null)}
        />
      ))}
      <button type="button" class="btn btn-primary h-11" disabled={!lists.A || !lists.B} onClick={() => setView('attack')}>
        Attack calculator
      </button>
    </main>
  )
}
