import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import {
  MAX_ROUNDS,
  MAX_SPELL_TOKENS,
  PLAYERS,
  cancelActivation,
  castSpell,
  endActivation,
  endRound,
  grantedByAuras,
  isOut,
  modelsLeft,
  resolveMorale,
  roundOver,
  setShaken,
  setSpellTokens,
  setWounds,
  startActivation,
  unitsLeftToActivate,
  winner,
} from '../lib/battle'
import type { ActivationAction, BattleState, Player, UnitKey, UnitState } from '../types/battle'
import type { ParsedList, RuleRef } from '../types/list'
import ruleIndex from '../data/rule-index.json'
import { movement, movementGrants, type Movement } from '../lib/movement'
import { defaultContext, type GrantOption } from '../lib/rules/resolve'
import type { RuleIndex } from '../types/rules'
import { CastPanel } from './CastPanel'
import { MoraleDialog } from './MoraleDialog'
import { Stepper } from './Stepper'

interface Props {
  state: BattleState
  lists: Record<Player, ParsedList>
  onChange: (state: BattleState) => void
  onAttack: (attacker: UnitKey, options?: { target?: UnitKey; strikeBack?: boolean }) => void
  /** Back home with the battle still in progress. */
  onLeave: () => void
  onShowLog: () => void
  /** Archive the battle to history. */
  onFinish: () => void
  onAbandon: () => void
}

const context = defaultContext(ruleIndex as RuleIndex)

const ACTIONS: { action: ActivationAction; label: string }[] = [
  { action: 'hold', label: 'Hold' },
  { action: 'advance', label: 'Advance' },
  { action: 'rush', label: 'Rush' },
  { action: 'charge', label: 'Charge' },
]

function actionHint(action: ActivationAction, move: Movement): string {
  const inches = `${move.moves[action]}"`
  switch (action) {
    case 'hold':
      return '0", can shoot'
    case 'advance':
      return `${inches}, can shoot after`
    case 'rush':
      return move.canShootAfterRush ? `${inches}, can shoot after` : `${inches}, can't shoot`
    default:
      return `${inches} into melee`
  }
}

const DONE_LABEL: Record<ActivationAction, string> = {
  hold: 'Held',
  advance: 'Advanced',
  rush: 'Rushed',
  charge: 'Charged',
  idle: 'Recovered',
}

export function BattleScreen({ state, lists, onChange, onAttack, onLeave, onShowLog, onFinish, onAbandon }: Props) {
  const [choosing, setChoosing] = useState<UnitKey | null>(null)
  const [casting, setCasting] = useState(false)
  useEffect(() => setCasting(false), [state.activation?.unit])
  const activation = state.activation
  const activeUnit = activation ? state.units[activation.unit] : null
  const morale = state.pendingMorale[0]
  const over = roundOver(state)
  const [tab, setTab] = useState<Player>(state.turn)
  // Follow the turn as it passes, so the army that activates next is the one on screen.
  useEffect(() => setTab(state.turn), [state.turn, state.round])

  const parsedUnit = (u: UnitState) => lists[u.player].units.find((x) => x.id === u.unitId)
  const moraleReminders = (u: UnitState) => {
    const texts = Object.values(lists[u.player].rules)
    const text = (r: RuleRef) => lists[u.player].rules[r.id]?.description ?? texts.find((t) => t.name === r.name)?.description ?? ''
    // Granted rules (e.g. a Banner) carry no id, so their text is found by name.
    return [...(parsedUnit(u)?.rules ?? []), ...grantedByAuras(state, u.key)].filter((r) => /Morale/i.test(text(r)))
  }

  const activate = (key: UnitKey, action: ActivationAction) => {
    setChoosing(null)
    onChange(startActivation(state, key, action))
  }

  return (
    <div class="flex flex-col min-h-dvh">
      <header class="sticky top-0 z-10 bg-base-100 border-b border-base-content/10 pt-safe">
        <div class="flex items-center gap-2 px-2 h-14 max-w-xl mx-auto">
          <div class="flex-1 min-w-0 px-2">
            <div class="font-bold">
              Round {state.round}/{MAX_ROUNDS}
            </div>
            <div class="text-xs opacity-70 truncate">
              {state.complete ? 'Battle over' : over ? 'End of round' : `${state.listNames[state.turn]} to activate`}
            </div>
          </div>
          <details class="dropdown dropdown-end">
            <summary class="btn btn-ghost h-11 min-h-11" aria-label="Battle menu">
              ☰
            </summary>
            <ul class="dropdown-content menu bg-base-200 rounded-box w-56 shadow p-0 divide-y divide-base-content/10 z-20">
              <li>
                <button type="button" class="h-12 rounded-none" onClick={onShowLog}>
                  Battle log ({state.log.length})
                </button>
              </li>
              <li>
                <button type="button" class="h-12 rounded-none" onClick={onLeave}>
                  Back to lists
                </button>
              </li>
              <li>
                <button
                  type="button"
                  class="h-12 rounded-none text-error"
                  onClick={() => window.confirm('Abandon this battle? It will be kept in history.') && onAbandon()}
                >
                  Abandon battle
                </button>
              </li>
            </ul>
          </details>
        </div>
        <div role="tablist" aria-label="Army" class="tabs tabs-border max-w-xl mx-auto px-2">
          {PLAYERS.map((player) => {
            const left = unitsLeftToActivate(state, player).length
            const toActivate = state.turn === player && !over && !state.complete
            return (
              <button
                key={player}
                type="button"
                role="tab"
                aria-selected={tab === player}
                class={`tab flex-1 h-11 min-w-0 ${tab === player ? 'tab-active font-semibold' : ''}`}
                onClick={() => setTab(player)}
              >
                <span class="truncate">{state.listNames[player]}</span>
                <span class="text-xs font-normal opacity-70 shrink-0">
                  &nbsp;· {left} left{toActivate ? ' ●' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </header>

      <main class="flex flex-col gap-3 px-4 py-3 pb-safe max-w-xl mx-auto w-full">
        {state.complete && <BattleResult state={state} onFinish={onFinish} />}

        {!state.complete && over && <RoundEnd state={state} onEnd={(objectives) => onChange(endRound(state, objectives))} />}

        {[tab].map((player) => (
          <section key={player} role="tabpanel" aria-label={state.listNames[player]} class="flex flex-col gap-2">
            {Object.values(state.units)
              .filter((u) => u.player === player)
              .map((u) => (
                <UnitRow
                  key={u.key}
                  unit={u}
                  rules={[...(parsedUnit(u)?.rules ?? []), ...grantedByAuras(state, u.key)]}
                  boostOptions={movementGrants(lists[u.player].units.flatMap((x) => x.rules), context)}
                  canActivate={!activation && !u.activated && !isOut(u) && !state.complete}
                  isActive={activation?.unit === u.key}
                  choosing={choosing === u.key}
                  onChoose={() => setChoosing(choosing === u.key ? null : u.key)}
                  onActivate={(action) => activate(u.key, action)}
                  onWounds={(w) => onChange(setWounds(state, u.key, w))}
                  onShaken={(s) => onChange(setShaken(state, u.key, s))}
                  onTokens={(t) => onChange(setSpellTokens(state, u.key, t))}
                >
                  {activation && activeUnit?.key === u.key && (
                      <div class="flex flex-col gap-2" aria-label="Current activation">
                        <p class="text-sm opacity-70">{ACTIONS.find((a) => a.action === activation.action)?.label ?? 'Idle'}</p>
                        {casting && activeUnit.caster !== null && (
                          <CastPanel
                            state={state}
                            caster={activeUnit.key}
                            armyId={parsedUnit(activeUnit)?.armyId ?? ''}
                            amplified={(parsedUnit(activeUnit)?.rules ?? []).some((r) => r.name === 'Spell Amplifier')}
                            onCast={(cast) =>
                              onChange(
                                castSpell(
                                  state,
                                  cast,
                                  (parsedUnit(activeUnit)?.rules ?? []).some((r) => r.name === 'Spell Amplifier'),
                                ),
                              )
                            }
                            onClose={() => setCasting(false)}
                          />
                        )}
                        <div class="grid grid-cols-2 gap-2">
                          {activeUnit.caster !== null && !casting && activation.action !== 'idle' && !activation.attacked && (
                            <button type="button" class="btn btn-secondary h-11" onClick={() => setCasting(true)}>
                              Cast spell ({activeUnit.spellTokens})
                            </button>
                          )}
                          {activation.action !== 'idle' &&
                            (activation.action !== 'rush' ||
                              movement(parsedUnit(activeUnit)?.rules ?? [], context).canShootAfterRush) && (
                            <button type="button" class="btn btn-primary h-11" onClick={() => onAttack(activation.unit)}>
                              {activation.action === 'charge' ? 'Fight' : 'Shoot'}
                            </button>
                          )}
                          {activation.melee && !isOut(state.units[activation.melee.target]) && (
                            <button
                              type="button"
                              class={`btn h-11 ${activation.melee.struckBack ? 'btn-ghost border border-base-content/20' : 'btn-secondary'}`}
                              onClick={() => onAttack(activation.melee!.target, { target: activation.melee!.charger, strikeBack: true })}
                            >
                              Strike back
                            </button>
                          )}
                          <button type="button" class="btn btn-outline h-11" onClick={() => onChange(endActivation(state))}>
                            End activation
                          </button>
                          {Object.keys(activation.woundsTaken).length === 0 && (
                            <button type="button" class="btn btn-ghost h-11" onClick={() => onChange(cancelActivation(state))}>
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                  )}
                </UnitRow>
              ))}
          </section>
        ))}
      </main>

      {morale && (
        <MoraleDialog
          key={morale.unit}
          test={morale}
          unit={state.units[morale.unit]}
          reminders={moraleReminders(state.units[morale.unit])}
          onResolve={(passed) => onChange(resolveMorale(state, morale.unit, passed))}
        />
      )}
    </div>
  )
}

function UnitRow({
  unit,
  rules,
  boostOptions,
  canActivate,
  isActive,
  choosing,
  onChoose,
  onActivate,
  onWounds,
  onShaken,
  onTokens,
  children,
}: {
  /** Activation controls, shown where the action buttons were. */
  children?: ComponentChildren
  unit: UnitState
  /** Held rules plus Aura grants. */
  rules: RuleRef[]
  /** Movement Buffs and Marks the army can give this activation. */
  boostOptions: GrantOption[]
  canActivate: boolean
  isActive: boolean
  choosing: boolean
  onChoose: () => void
  onActivate: (action: ActivationAction) => void
  onWounds: (wounds: number) => void
  onShaken: (shaken: boolean) => void
  onTokens: (tokens: number) => void
}) {
  const [boosts, setBoosts] = useState<string[]>([])
  // Buffs only last for the next move, so they're cleared once the activation is done.
  useEffect(() => {
    if (unit.activated) setBoosts([])
  }, [unit.activated])
  const move = movement([...rules, ...boostOptions.filter((o) => boosts.includes(o.label)).map((o) => o.rule)], context)
  const out = isOut(unit)
  const total = unit.size * unit.tough
  return (
    <div class={`card bg-base-200 ${out ? 'opacity-50' : ''} ${isActive ? 'border border-primary/40' : ''}`}>
      <div class="card-body p-3 gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class={`font-medium truncate ${out ? 'line-through' : ''}`}>{unit.name}</div>
            <div class="flex flex-wrap gap-1 text-xs pt-0.5">
              <span class="badge badge-neutral">
                {modelsLeft(unit)}/{unit.size} model{unit.size === 1 ? '' : 's'}
              </span>
              {unit.activated && (
                <span class="badge badge-secondary">{unit.lastAction ? DONE_LABEL[unit.lastAction] : 'Activated'}</span>
              )}
              {unit.shaken && <span class="badge badge-outline">Shaken</span>}
              {unit.fatigued && <span class="badge badge-outline">Fatigued</span>}
              {unit.routed && <span class="badge badge-outline">Routed</span>}
              {!unit.routed && out && <span class="badge badge-outline">Destroyed</span>}
            </div>
          </div>
          {canActivate && (
            <button type="button" class="btn btn-sm h-9 min-h-9 btn-primary shrink-0" aria-expanded={choosing} onClick={onChoose}>
              Activate
            </button>
          )}
        </div>

        {children}

        {choosing && (
          <div class="grid grid-cols-2 gap-2" role="group" aria-label={`Action for ${unit.name}`}>
            {unit.shaken ? (
              <button type="button" class="btn h-11 col-span-2" onClick={() => onActivate('idle')}>
                Stay idle to recover
              </button>
            ) : (
              ACTIONS.filter((a) => !move.blocked.includes(a.action)).map((a) => (
                <button key={a.action} type="button" class="btn h-auto min-h-11 py-1 flex-col gap-0" onClick={() => onActivate(a.action)}>
                  <span>{a.label}</span>
                  <span class="text-[10px] font-normal opacity-70">{actionHint(a.action, move)}</span>
                </button>
              ))
            )}
          </div>
        )}

        {choosing && !unit.shaken && boostOptions.length > 0 && (
          <div class="flex flex-wrap gap-2" aria-label="Movement Buffs">
            {boostOptions.map((o) => {
              const on = boosts.includes(o.label)
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={on}
                  title={`Given by ${o.label}`}
                  class={`btn btn-sm h-9 min-h-9 ${on ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
                  onClick={() => setBoosts(on ? boosts.filter((b) => b !== o.label) : [...boosts, o.label])}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        )}

        {(choosing || isActive) && (
          <div class="text-xs opacity-70 flex flex-col gap-0.5">
            {move.sources.length > 0 && <span>Moves changed by {move.sources.join(', ')}</span>}
            {move.notes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </div>
        )}

        <details class="text-sm">
          <summary class="cursor-pointer min-h-9 flex items-center opacity-70">Adjust</summary>
          <div class="flex flex-col gap-2 pt-2">
            <Stepper label="Wounds taken" value={unit.wounds} onChange={onWounds} min={0} max={total} display={`${unit.wounds}/${total}`} />
            {unit.caster !== null && (
              <Stepper label="Spell tokens" value={unit.spellTokens} onChange={onTokens} min={0} max={MAX_SPELL_TOKENS} />
            )}
            <label class="flex items-center justify-between min-h-9">
              <span>Shaken</span>
              <input type="checkbox" class="toggle" checked={unit.shaken} onChange={(e) => onShaken((e.target as HTMLInputElement).checked)} />
            </label>
          </div>
        </details>
      </div>
    </div>
  )
}

function RoundEnd({ state, onEnd }: { state: BattleState; onEnd: (objectives: (Player | null)[]) => void }) {
  const [objectives, setObjectives] = useState(state.objectives)
  const last = state.round >= MAX_ROUNDS
  return (
    <section class="card bg-base-200 border border-primary/40" aria-label="End of round">
      <div class="card-body p-4 gap-3">
        <h2 class="font-bold">End of round {state.round}</h2>
        <p class="text-xs opacity-70">
          A marker is seized by a unit within 3" while no enemies are. Contested markers go neutral; others stay with
          their last controller. Shaken units can't seize or contest.
        </p>
        {objectives.map((controller, i) => (
          <div key={i} class="flex items-center gap-2">
            <span class="text-sm w-20 shrink-0">Marker {i + 1}</span>
            <div class="join flex-1" role="radiogroup" aria-label={`Marker ${i + 1}`}>
              {(['A', null, 'B'] as const).map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={controller === value}
                  class={`btn join-item flex-1 h-11 px-1 text-xs ${controller === value ? 'btn-primary' : ''}`}
                  onClick={() => setObjectives(objectives.map((o, j) => (j === i ? value : o)))}
                >
                  {value ? state.listNames[value] : 'Neutral'}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" class="btn btn-primary h-11" onClick={() => onEnd(objectives)}>
          {last ? 'Finish battle' : `Start round ${state.round + 1}`}
        </button>
      </div>
    </section>
  )
}

function BattleResult({ state, onFinish }: { state: BattleState; onFinish: () => void }) {
  const result = winner(state)
  const held = (p: Player) => state.objectives.filter((o) => o === p).length
  return (
    <section class="card bg-base-200 border border-primary/40" aria-label="Result">
      <div class="card-body p-4 gap-2">
        <h2 class="text-lg font-bold">{result === 'draw' ? 'Draw' : `${state.listNames[result]} wins`}</h2>
        <p class="text-sm">
          Objectives: {state.listNames.A} {held('A')}, {state.listNames.B} {held('B')}
        </p>
        <button type="button" class="btn btn-primary h-11" onClick={onFinish}>
          Save to history
        </button>
      </div>
    </section>
  )
}
