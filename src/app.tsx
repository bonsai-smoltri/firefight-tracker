import { useEffect, useRef, useState } from 'preact/hooks'
import { AttackScreen } from './components/AttackScreen'
import { BattleLog } from './components/BattleLog'
import { BattleScreen } from './components/BattleScreen'
import { BattleSetup } from './components/BattleSetup'
import { HistoryList, recordHeadline } from './components/HistoryList'
import { ListSlot } from './components/ListSlot'
import { createBattle, endActivation, recordAttack, winner } from './lib/battle'
import {
  clearList,
  loadBattle,
  loadHistory,
  loadList,
  loadUndo,
  MAX_UNDO,
  saveBattle,
  saveHistory,
  saveList,
  saveUndo,
  type BattleRecord,
  type Side,
} from './lib/storage'
import type { BattleState, UnitKey } from './types/battle'
import type { ParsedList, ParsedWeapon } from './types/list'

type View =
  | { name: 'home' }
  | { name: 'calculator' }
  | { name: 'setup' }
  | { name: 'battle' }
  | { name: 'battle-log' }
  | {
      name: 'battle-attack'
      attacker: UnitKey
      target?: UnitKey
      strikeBack?: boolean
      spell?: ParsedWeapon
      /** Scroll position to return to; the page starts at the top otherwise. */
      scrollY?: number
    }
  | { name: 'record'; record: BattleRecord }

export function App() {
  const [lists, setLists] = useState<Record<Side, ParsedList | null>>(() => ({ A: loadList('A'), B: loadList('B') }))
  const [battle, setBattle] = useState<BattleState | null>(loadBattle)
  const [history, setHistory] = useState<BattleRecord[]>(loadHistory)
  // A battle under way is where you want to land after the phone locks mid-game.
  const [view, setView] = useState<View>(() => (battle && lists.A && lists.B ? { name: 'battle' } : { name: 'home' }))

  const [undoStack, setUndoStack] = useState<BattleState[]>(() => (battle ? loadUndo(battle.id) : []))

  const chargerScroll = useRef(0)
  // An attack page always opens at the top, where the target list is, unless it's being returned to.
  useEffect(() => {
    if (view.name !== 'battle-attack') return
    const y = view.scrollY ?? 0
    requestAnimationFrame(() => window.scrollTo({ top: y }))
  }, [view])

  useEffect(() => saveBattle(battle), [battle])
  useEffect(() => saveUndo(undoStack), [undoStack])

  /** Every change to a battle in progress goes through here, so it can be undone. */
  const changeBattle = (next: BattleState) => {
    if (!battle || next === battle) return
    setUndoStack((stack) => [...stack, battle].slice(-MAX_UNDO))
    setBattle(next)
  }
  const undo = () => {
    const previous = undoStack.at(-1)
    if (!previous) return
    setUndoStack(undoStack.slice(0, -1))
    setBattle(previous)
  }

  /** The only place a battle leaves the active slot, so it can't be archived twice. */
  const archiveBattle = () => {
    if (!battle) return
    if (battle.log.length > 0) {
      const record: BattleRecord = { savedAt: Date.now(), winner: battle.complete ? winner(battle) : null, state: battle }
      const next = [record, ...history.filter((r) => r.state.id !== battle.id)]
      setHistory(next)
      saveHistory(next)
    }
    setBattle(null)
    setUndoStack([])
  }

  const setList = (side: Side, list: ParsedList | null) => {
    // A battle refers to the lists' units, so changing a list ends it.
    archiveBattle()
    if (list) saveList(side, list)
    else clearList(side)
    setLists((current) => ({ ...current, [side]: list }))
  }

  const both = lists.A && lists.B ? { A: lists.A, B: lists.B } : null

  if (view.name === 'calculator' && both) {
    return <AttackScreen lists={both} onBack={() => setView({ name: 'home' })} />
  }

  if (view.name === 'setup' && both) {
    return (
      <BattleSetup
        lists={both}
        onCancel={() => setView({ name: 'home' })}
        onStart={(setup) => {
          archiveBattle()
          setBattle(createBattle({ lists: both, ...setup }))
          setView({ name: 'battle' })
        }}
      />
    )
  }

  if (view.name === 'battle-attack' && both && battle) {
    return (
      <AttackScreen
        key={`${view.attacker}-${view.spell?.name ?? (view.strikeBack ? 'back' : 'attack')}`}
        lists={both}
        backLabel="← Battle"
        onBack={() => setView({ name: 'battle' })}
        battle={{
          state: battle,
          attacker: view.attacker,
          target: view.target,
          strikeBack: view.strikeBack,
          spell: view.spell,
          onApply: (record) => changeBattle(recordAttack(battle, record)),
          onStrikeBack: () => {
            const melee = battle.activation?.melee
            if (!melee) return
            // Remembered so ending the strike back lands back where the charger left off.
            chargerScroll.current = window.scrollY
            setView({ name: 'battle-attack', attacker: melee.target, target: melee.charger, strikeBack: true })
          },
          onEndStrikeBack: () => {
            const melee = battle.activation?.melee
            if (!melee) return setView({ name: 'battle' })
            setView({ name: 'battle-attack', attacker: melee.charger, scrollY: chargerScroll.current })
          },
          onEndActivation: () => {
            // Morale tests this causes are asked for on the battle screen.
            changeBattle(endActivation(battle))
            setView({ name: 'battle' })
          },
        }}
      />
    )
  }

  if (view.name === 'battle' && both && battle) {
    return (
      <BattleScreen
        state={battle}
        lists={both}
        onChange={changeBattle}
        onUndo={undoStack.length > 0 ? undo : null}
        onAttack={(attacker, options) => setView({ name: 'battle-attack', attacker, ...options })}
        onLeave={() => setView({ name: 'home' })}
        onShowLog={() => setView({ name: 'battle-log' })}
        onFinish={() => {
          archiveBattle()
          setView({ name: 'home' })
        }}
        onAbandon={() => {
          archiveBattle()
          setView({ name: 'home' })
        }}
      />
    )
  }

  if (view.name === 'battle-log' && battle) {
    return (
      <main class="min-h-dvh pt-safe pb-safe px-4 max-w-xl mx-auto flex flex-col gap-4">
        <div class="flex items-center gap-2 pt-4">
          <button type="button" class="btn btn-ghost h-11 min-h-11" onClick={() => setView({ name: 'battle' })}>
            ← Battle
          </button>
          <h1 class="text-base font-bold flex-1 min-w-0">Battle log · round {battle.round}</h1>
        </div>
        <BattleLog state={battle} open />
      </main>
    )
  }

  if (view.name === 'record') {
    const { record } = view
    return (
      <main class="min-h-dvh pt-safe pb-safe px-4 max-w-xl mx-auto flex flex-col gap-4">
        <div class="flex items-center gap-2 pt-4">
          <button type="button" class="btn btn-ghost h-11 min-h-11" onClick={() => setView({ name: 'home' })}>
            ← Lists
          </button>
          <h1 class="text-base font-bold flex-1 min-w-0">{recordHeadline(record)}</h1>
        </div>
        <BattleLog state={record.state} open />
        <button
          type="button"
          class="btn btn-ghost h-11 text-error"
          onClick={() => {
            if (!window.confirm('Delete this battle from history?')) return
            const next = history.filter((r) => r !== record)
            setHistory(next)
            saveHistory(next)
            setView({ name: 'home' })
          }}
        >
          Delete from history
        </button>
      </main>
    )
  }

  return (
    <main class="min-h-dvh pt-safe pb-safe px-4 max-w-xl mx-auto flex flex-col gap-4">
      <h1 class="text-2xl font-bold pt-6">Firefight Tracker</h1>
      {battle && both && (
        <button type="button" class="btn btn-primary h-11" onClick={() => setView({ name: 'battle' })}>
          Resume battle · round {battle.round}
        </button>
      )}
      {(['A', 'B'] as const).map((side) => (
        <ListSlot
          key={side}
          label={side === 'A' ? 'Player 1' : 'Player 2'}
          list={lists[side]}
          onImported={(list) => setList(side, list)}
          onClear={() => setList(side, null)}
        />
      ))}
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="btn btn-primary h-11"
          disabled={!both}
          onClick={() => (!battle || window.confirm('Start a new battle? The current one will be saved to history.')) && setView({ name: 'setup' })}
        >
          New battle
        </button>
        <button type="button" class="btn btn-outline h-11" disabled={!both} onClick={() => setView({ name: 'calculator' })}>
          Attack calculator
        </button>
      </div>
      <HistoryList records={history} onOpen={(record) => setView({ name: 'record', record })} />
    </main>
  )
}
