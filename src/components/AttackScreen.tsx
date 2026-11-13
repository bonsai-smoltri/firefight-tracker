import { useMemo, useState } from 'preact/hooks'
import ruleIndex from '../data/rule-index.json'
import { rollAttack, type AttackRoll } from '../lib/rules/dice'
import { attackControls, resolveAttack, weaponModes, type ResolvedAttack } from '../lib/rules/engine'
import { defaultContext } from '../lib/rules/resolve'
import type { Side } from '../lib/storage'
import type { ParsedList, ParsedUnit } from '../types/list'
import { SITUATION_DEFS, defaultSituation, type AttackMode, type RuleIndex, type Situation, type SituationKey } from '../types/rules'
import { AttackReadout } from './AttackReadout'
import { RollResult } from './RollResult'
import { RulesInPlay } from './RulesInPlay'
import { Stepper } from './Stepper'

const context = defaultContext(ruleIndex as RuleIndex)
const other = (side: Side): Side => (side === 'A' ? 'B' : 'A')
const unitName = (u: ParsedUnit) => u.customName ?? u.name

interface Props {
  lists: Record<Side, ParsedList>
  onBack: () => void
}

export function AttackScreen({ lists, onBack }: Props) {
  const [attackerSide, setAttackerSide] = useState<Side>('A')
  const [attackerId, setAttackerId] = useState(lists.A.units[0].id)
  const [targetId, setTargetId] = useState(lists.B.units[0].id)
  const [weaponIndex, setWeaponIndex] = useState(0)
  const [modeChoice, setModeChoice] = useState<AttackMode | null>(null)
  const [weaponCount, setWeaponCount] = useState<number | null>(null)
  const [targetModels, setTargetModels] = useState<number | null>(null)
  const [situation, setSituation] = useState<Situation>(defaultSituation)
  const [manual, setManual] = useState<string[]>([])
  const [roll, setRoll] = useState<{ for: ResolvedAttack; result: AttackRoll } | null>(null)

  const attackerList = lists[attackerSide]
  const targetList = lists[other(attackerSide)]
  const attacker = attackerList.units.find((u) => u.id === attackerId) ?? attackerList.units[0]
  const target = targetList.units.find((u) => u.id === targetId) ?? targetList.units[0]
  const weapon = attacker.weapons[weaponIndex] ?? attacker.weapons[0]
  const modes = weapon ? weaponModes(weapon) : []
  const mode = modeChoice && modes.includes(modeChoice) ? modeChoice : modes[0]
  const ruleTexts = useMemo(() => ({ ...lists.A.rules, ...lists.B.rules }), [lists])

  const models = targetModels ?? target.size
  const copies = weaponCount ?? weapon?.count ?? 0

  const resolved = useMemo(
    () =>
      weapon && mode
        ? resolveAttack({
            attacker,
            weapon,
            target,
            mode,
            situation,
            context,
            weaponCount: copies,
            targetModels: models,
            manual,
            ruleTexts,
          })
        : null,
    [attacker, weapon, target, mode, situation, copies, models, manual, ruleTexts],
  )
  const controls = useMemo(
    () => (weapon && mode ? attackControls({ attacker, weapon, target, mode, context }) : { situations: [], manual: [] }),
    [attacker, weapon, target, mode],
  )

  const pickAttacker = (id: string) => {
    setAttackerId(id)
    setWeaponIndex(0)
    setModeChoice(null)
    setWeaponCount(null)
  }
  const pickTarget = (id: string) => {
    setTargetId(id)
    setTargetModels(null)
  }
  const swap = () => {
    setAttackerSide(other(attackerSide))
    pickAttacker(target.id)
    pickTarget(attacker.id)
  }
  const toggle = (key: SituationKey) => {
    const on = !situation[key]
    const next = { ...situation, [key]: on }
    if (key === 'overTwelve' && on) next.overNine = true
    if (key === 'overNine' && !on) next.overTwelve = false
    if (key === 'charging' && !on) next.chargeOverSix = false
    if (key === 'chargeOverSix' && on) next.charging = true
    setSituation(next)
  }

  const currentRoll = roll && roll.for === resolved ? roll.result : null

  return (
    <div class="flex flex-col min-h-dvh">
      <header class="sticky top-0 z-10 bg-base-100 border-b border-base-content/10 pt-safe">
        <div class="flex items-center gap-2 px-2 h-14 max-w-xl mx-auto">
          <button type="button" class="btn btn-ghost h-11 min-h-11" onClick={onBack} aria-label="Back to lists">
            ← Lists
          </button>
          <h1 class="font-bold flex-1 text-center">Attack</h1>
          <span class="w-20" aria-hidden="true" />
        </div>
      </header>

      <main class="flex flex-col gap-3 px-4 py-3 pb-safe max-w-xl mx-auto w-full">
        <div class="flex items-end gap-2">
          <UnitSelect label={`Attacker · ${attackerList.name}`} list={attackerList} unit={attacker} onPick={pickAttacker} />
          <button type="button" class="btn btn-ghost border border-base-content/20 h-11 min-h-11 w-11 p-0" onClick={swap} aria-label="Swap attacker and target">
            ⇄
          </button>
          <UnitSelect label={`Target · ${targetList.name}`} list={targetList} unit={target} onPick={pickTarget} />
        </div>

        {attacker.weapons.length === 0 ? (
          <p class="text-sm opacity-70">{unitName(attacker)} has no weapons.</p>
        ) : (
          <div class="flex flex-col gap-1" role="radiogroup" aria-label="Weapon">
            {attacker.weapons.map((w, i) => (
              <button
                key={`${w.label}-${i}`}
                type="button"
                role="radio"
                aria-checked={w === weapon}
                class={`btn h-auto min-h-11 py-2 justify-start text-left font-normal ${w === weapon ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
                onClick={() => {
                  setWeaponIndex(i)
                  setModeChoice(null)
                  setWeaponCount(null)
                }}
              >
                {w.count > 1 && `${w.count}× `}
                {w.label}
              </button>
            ))}
          </div>
        )}

        {modes.length > 1 && (
          <div class="join w-full" role="radiogroup" aria-label="Attack type">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === mode}
                class={`btn join-item flex-1 h-11 ${m === mode ? 'btn-primary' : ''}`}
                onClick={() => setModeChoice(m)}
              >
                {m === 'shooting' ? 'Shooting' : 'Melee'}
              </button>
            ))}
          </div>
        )}

        {weapon && (
          <div class="flex flex-col gap-2">
            {weapon.count > 1 && (
              <Stepper label="Weapons attacking" value={copies} onChange={setWeaponCount} min={1} max={weapon.count} />
            )}
            {target.size > 1 && (
              <Stepper label="Models in target" value={models} onChange={setTargetModels} min={1} max={target.size} />
            )}
          </div>
        )}

        {controls.situations.length > 0 && (
          <div class="flex flex-wrap gap-2" aria-label="Situation">
            {SITUATION_DEFS.filter((d) => controls.situations.includes(d.key)).map((def) => (
              <Toggle key={def.key} label={def.label} hint={def.hint} on={situation[def.key]} onClick={() => toggle(def.key)} />
            ))}
            {controls.manual.map((name) => (
              <Toggle
                key={name}
                label={name}
                hint={`Use ${name} for this attack`}
                on={manual.includes(name)}
                onClick={() => setManual(manual.includes(name) ? manual.filter((m) => m !== name) : [...manual, name])}
              />
            ))}
          </div>
        )}

        {resolved && (
          <>
            <section class="card bg-base-200">
              <div class="card-body p-4 gap-3">
                <AttackReadout attack={resolved} targetModels={models} targetTough={target.tough} />
                <button
                  type="button"
                  class="btn btn-primary h-11"
                  onClick={() => setRoll({ for: resolved, result: rollAttack(resolved, { models, tough: target.tough }) })}
                >
                  {currentRoll ? 'Roll again' : 'Roll'}
                </button>
                {currentRoll && <RollResult roll={currentRoll} />}
              </div>
            </section>
            <RulesInPlay rules={resolved.rules} texts={ruleTexts} />
          </>
        )}
      </main>
    </div>
  )
}

function UnitSelect({ label, list, unit, onPick }: { label: string; list: ParsedList; unit: ParsedUnit; onPick: (id: string) => void }) {
  return (
    <label class="flex-1 min-w-0 flex flex-col gap-1">
      <span class="text-xs opacity-70 truncate">{label}</span>
      <select class="select select-bordered h-11 w-full" value={unit.id} onChange={(e) => onPick((e.target as HTMLSelectElement).value)}>
        {list.units.map((u) => (
          <option key={u.id} value={u.id}>
            {unitName(u)}
          </option>
        ))}
      </select>
      <span class="text-xs opacity-70">
        Q{unit.quality}+ D{unit.defense}+{unit.tough > 1 ? ` · Tough ${unit.tough}` : ''} · {unit.size === 1 ? '1 model' : `${unit.size} models`}
      </span>
    </label>
  )
}

function Toggle({ label, hint, on, onClick }: { label: string; hint: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class={`btn btn-sm h-9 min-h-9 ${on ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
      aria-pressed={on}
      title={hint}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
