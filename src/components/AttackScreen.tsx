import { useMemo, useRef, useState } from 'preact/hooks'
import ruleIndex from '../data/rule-index.json'
import { atHalfOrLess, grantedByAuras, isOut, modelsLeft, unitKey, type AttackRecord } from '../lib/battle'
import { rollAttack, type AttackRoll } from '../lib/rules/dice'
import { attackControls, resolveAttack, weaponModes, type ResolvedAttack } from '../lib/rules/engine'
import { defaultContext, grantOptions, type GrantOption } from '../lib/rules/resolve'
import { specialAttacks } from '../lib/rules/special'
import { movement } from '../lib/movement'
import { attackPhase, weaponUse } from '../lib/weapon-use'
import type { Side } from '../lib/storage'
import type { BattleState, UnitKey } from '../types/battle'
import type { ParsedList, ParsedUnit, ParsedWeapon, RuleRef } from '../types/list'
import { SITUATION_DEFS, defaultSituation, type AttackMode, type RuleIndex, type Situation, type SituationKey } from '../types/rules'
import { AttackReadout } from './AttackReadout'
import { RollResult } from './RollResult'
import { RulesInPlay } from './RulesInPlay'
import { Stepper } from './Stepper'

const context = defaultContext(ruleIndex as RuleIndex)
const other = (side: Side): Side => (side === 'A' ? 'B' : 'A')
const unitName = (u: ParsedUnit) => u.customName ?? u.name

/** Set when the attack is part of a battle: the attacker is fixed and wounds can be applied. */
export interface BattleAttack {
  state: BattleState
  attacker: UnitKey
  /** Fixed target, e.g. the charger when striking back. */
  target?: UnitKey
  strikeBack?: boolean
  /** A successful damage spell: the only attack offered. */
  spell?: ParsedWeapon
  onApply: (record: AttackRecord) => void
  /** Offered once a charge has been fought and the target hasn't struck back. */
  onStrikeBack: () => void
  /** Back to the charger's fight, which then ends the activation. */
  onEndStrikeBack: () => void
  onEndActivation: () => void
}

interface Props {
  lists: Record<Side, ParsedList>
  onBack: () => void
  backLabel?: string
  battle?: BattleAttack
}

function initialState(lists: Record<Side, ParsedList>, battle?: BattleAttack) {
  if (!battle) {
    return { side: 'A' as Side, attackerId: lists.A.units[0].id, targetId: lists.B.units[0].id, situation: defaultSituation() }
  }
  const attacker = battle.state.units[battle.attacker]
  const side = attacker.player
  const activation = battle.state.activation
  const enemies = Object.values(battle.state.units).filter((u) => u.player !== side && !isOut(u))
  const targetKey = battle.target ?? activation?.melee?.target ?? enemies[0]?.key
  const target = targetKey ? battle.state.units[targetKey] : undefined
  const charging =
    !battle.strikeBack && !battle.spell && activation?.unit === battle.attacker && activation.action === 'charge'
  return {
    side,
    attackerId: attacker.unitId,
    targetId: target?.unitId ?? lists[other(side)].units[0].id,
    situation: {
      ...defaultSituation(),
      charging,
      attackerFatigued: attacker.fatigued || (battle.strikeBack === true && attacker.shaken),
      targetStationary: target ? !target.moved : false,
      targetShaken: target?.shaken ?? false,
      targetFatigued: target?.fatigued ?? false,
      targetAboveHalf: target ? !atHalfOrLess(target) : true,
    },
  }
}

export function AttackScreen({ lists, onBack, backLabel = '← Lists', battle }: Props) {
  const [initial] = useState(() => initialState(lists, battle))
  const [attackerSide, setAttackerSide] = useState<Side>(initial.side)
  const [attackerId, setAttackerId] = useState(initial.attackerId)
  const [targetId, setTargetId] = useState(initial.targetId)
  /** Null until a weapon is tapped, so the first usable one is picked by default. */
  const [weaponPick, setWeaponIndex] = useState<number | null>(null)
  const weaponSection = useRef<HTMLDivElement>(null)
  const readoutSection = useRef<HTMLElement>(null)
  const [modeChoice, setModeChoice] = useState<AttackMode | null>(battle?.strikeBack ? 'melee' : null)
  const [weaponCount, setWeaponCount] = useState<number | null>(null)
  const [targetModels, setTargetModels] = useState<number | null>(null)
  const [situation, setSituation] = useState<Situation>(initial.situation)
  const [manual, setManual] = useState<string[]>([])
  const [grants, setGrants] = useState<string[]>([])
  const [roll, setRoll] = useState<{ for: ResolvedAttack; result: AttackRoll } | null>(null)
  const [woundsToApply, setWoundsToApply] = useState(0)
  const [applied, setApplied] = useState<string | null>(null)

  const attackerList = lists[attackerSide]
  const targetSide = other(attackerSide)
  const targetList = lists[targetSide]
  const attacker = attackerList.units.find((u) => u.id === attackerId) ?? attackerList.units[0]
  const target = targetList.units.find((u) => u.id === targetId) ?? targetList.units[0]
  const attackerKey = unitKey(attackerSide, attacker.id)
  const targetKey = unitKey(targetSide, target.id)
  const attackerState = battle?.state.units[attackerKey]
  const targetState = battle?.state.units[targetKey]

  const weapons = useMemo(
    () =>
      battle?.spell
        ? [battle.spell]
        : [
            ...attacker.weapons,
            // Impact only happens when charging, so it's never part of a strike back.
            ...specialAttacks(attacker).filter((w) => !(battle?.strikeBack && w.special?.fixedRoll === 2)),
          ],
    [attacker, battle?.strikeBack, battle?.spell],
  )
  // In a battle the activation decides shooting or melee, and greys out weapons that don't fit.
  const phase =
    battle && !battle.spell
      ? attackPhase(battle.state, {
          strikeBack: battle.strikeBack,
          canShootAfterRush: movement([...attacker.rules, ...grantedByAuras(battle.state, attackerKey)], context)
            .canShootAfterRush,
        })
      : null
  const uses = weapons.map((w) => (battle ? weaponUse(battle.state, attackerKey, w, battle.spell ? 'shooting' : phase) : null))
  const firstUsable = Math.max(0, uses.findIndex((u) => !u?.disabled))
  const weaponIndex = weaponPick ?? firstUsable
  const weapon = weapons[weaponIndex] ?? weapons[0]
  const modes = weapon ? weaponModes(weapon) : []
  const mode = phase && modes.includes(phase) ? phase : modeChoice && modes.includes(modeChoice) ? modeChoice : modes[0]
  const weaponDisabled = uses[weaponIndex]?.disabled ?? null
  const ruleTexts = useMemo(() => ({ ...lists.A.rules, ...lists.B.rules }), [lists])

  const targetLeft = targetState ? Math.max(1, modelsLeft(targetState)) : target.size
  // "Resolved as if the target was a unit of [1]" spells pick out one model.
  const models = weapons[weaponIndex]?.special?.singleModel ? 1 : Math.min(targetModels ?? targetLeft, target.size)
  const attackerLeft = attackerState ? modelsLeft(attackerState) : attacker.size
  const scaledCopies = weapon ? Math.max(1, Math.round((weapon.count * attackerLeft) / attacker.size)) : 0
  const copies = weaponCount ?? scaledCopies

  const grantChoices = useMemo(() => {
    const own = grantOptions(attackerList.units.flatMap((u) => u.rules), context)
    const theirs = grantOptions(targetList.units.flatMap((u) => u.rules), context)
    // Friendly effects come from the unit's own army, Debuffs from the other one.
    const pick = (options: GrantOption[], onEnemy: boolean, side: GrantOption['sides'][number]) =>
      options.filter((o) => o.onEnemy === onEnemy && o.sides.includes(side))
    return {
      attacker: [...pick(own, false, 'attacker'), ...pick(theirs, true, 'attacker')],
      target: [...pick(theirs, false, 'defender'), ...pick(own, true, 'defender')],
    }
  }, [attackerList, targetList])
  const granted = useMemo(() => {
    const pick = (options: GrantOption[], key: string): RuleRef[] =>
      options.filter((o) => grants.includes(`${key}:${o.label}`)).map((o) => o.rule)
    return {
      attacker: [...(battle ? grantedByAuras(battle.state, attackerKey) : []), ...pick(grantChoices.attacker, 'attacker')],
      target: [...(battle ? grantedByAuras(battle.state, targetKey) : []), ...pick(grantChoices.target, 'target')],
    }
  }, [battle, attackerKey, targetKey, grantChoices, grants])

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
            granted,
          })
        : null,
    [attacker, weapon, target, mode, situation, copies, models, manual, ruleTexts, granted],
  )
  const controls = useMemo(
    () =>
      weapon && mode ? attackControls({ attacker, weapon, target, mode, context, granted }) : { situations: [], manual: [] },
    [attacker, weapon, target, mode, granted],
  )

  const clearResult = () => {
    setApplied(null)
    setWoundsToApply(0)
  }
  const pickAttacker = (id: string) => {
    setAttackerId(id)
    setWeaponIndex(null)
    setModeChoice(null)
    setWeaponCount(null)
    clearResult()
  }
  const pickTarget = (id: string) => {
    setTargetId(id)
    setTargetModels(null)
    clearResult()
    const picked = battle?.state.units[unitKey(targetSide, id)]
    if (picked) {
      setSituation((s) => ({
        ...s,
        targetStationary: !picked.moved,
        targetShaken: picked.shaken,
        targetFatigued: picked.fatigued,
        targetAboveHalf: !atHalfOrLess(picked),
      }))
    }
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
  const toggleGrant = (id: string) => setGrants(grants.includes(id) ? grants.filter((g) => g !== id) : [...grants, id])

  const currentRoll = roll && roll.for === resolved ? roll.result : null
  const doRoll = () => {
    if (!resolved) return
    const result = rollAttack(resolved, { models, tough: target.tough })
    setRoll({ for: resolved, result })
    setWoundsToApply(result.wounds)
    setApplied(null)
  }
  const apply = () => {
    if (!battle || !weapon || !mode) return
    battle.onApply({
      attacker: attackerKey,
      target: targetKey,
      weapon: weapon.name,
      mode,
      wounds: woundsToApply,
      strikeBack: battle.strikeBack,
      spell: weapon.special?.spell,
    })
    setApplied(`${woundsToApply} wound${woundsToApply === 1 ? '' : 's'} applied to ${unitName(target)}`)
    setRoll(null)
    setWoundsToApply(0)
  }

  const targets = battle ? targetList.units.filter((u) => !isOut(battle.state.units[unitKey(targetSide, u.id)])) : targetList.units

  return (
    <div class="flex flex-col min-h-dvh">
      <header class="sticky top-0 z-10 bg-base-100 border-b border-base-content/10 pt-safe">
        <div class="flex items-center gap-2 px-2 h-14 max-w-xl mx-auto">
          <button type="button" class="btn btn-ghost h-11 min-h-11" onClick={onBack}>
            {backLabel}
          </button>
          <h1 class="font-bold flex-1 text-center">{battle?.spell ? battle.spell.name : battle?.strikeBack ? 'Strike back' : 'Attack'}</h1>
          <span class="w-20" aria-hidden="true" />
        </div>
      </header>

      <main class="flex flex-col gap-3 px-4 py-3 pb-safe max-w-xl mx-auto w-full">
        <div class="flex items-end gap-2">
          <UnitSelect
            label={`Attacker · ${attackerList.name}`}
            units={attackerList.units}
            unit={attacker}
            onPick={pickAttacker}
            locked={!!battle}
            left={attackerState ? modelsLeft(attackerState) : null}
          />
          {!battle && (
            <button type="button" class="btn btn-ghost border border-base-content/20 h-11 min-h-11 w-11 p-0" onClick={swap} aria-label="Swap attacker and target">
              ⇄
            </button>
          )}
          {!battle && (
            <UnitSelect
              label={`Target · ${targetList.name}`}
              units={targets}
              unit={target}
              onPick={pickTarget}
              locked={false}
              left={null}
            />
          )}
        </div>

        {battle && (
          <TargetList
            title={`Target · ${targetList.name}`}
            units={battle.target ? targets.filter((u) => u.id === target.id) : targets}
            selected={target.id}
            left={(u) => modelsLeft(battle.state.units[unitKey(targetSide, u.id)])}
            onPick={(id) => {
              pickTarget(id)
              scrollTo(weaponSection.current)
            }}
          />
        )}

        <div ref={weaponSection} class="flex flex-col gap-1 scroll-mt-16">
          {battle && <h2 class="text-xs opacity-70">{phase === 'melee' ? 'Melee weapons' : phase === 'shooting' ? 'Ranged weapons' : 'Weapon'}</h2>}
          {weapons.length === 0 ? (
            <p class="text-sm opacity-70">{unitName(attacker)} has no weapons.</p>
          ) : (
            <div class="flex flex-col gap-1" role="radiogroup" aria-label="Weapon">
              {weapons.map((w, i) => {
                const use = uses[i]
                const selected = i === weaponIndex
                return (
                  <button
                    key={`${w.label}-${i}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!!use?.disabled}
                    class={`btn h-auto min-h-11 py-2 justify-start text-left font-normal ${selected && !use?.disabled ? 'btn-primary' : 'btn-ghost border border-base-content/20'}`}
                    onClick={() => {
                      setWeaponIndex(i)
                      setModeChoice(battle?.strikeBack ? 'melee' : null)
                      setWeaponCount(null)
                      clearResult()
                      scrollTo(readoutSection.current)
                    }}
                  >
                    <span class="flex flex-col items-start flex-1 min-w-0">
                      <span>
                        {w.count > 1 && `${w.count}× `}
                        {weaponLabel(w)}
                      </span>
                      {w.special && !w.special.spell && <span class="text-xs opacity-70">{w.special.when}</span>}
                      {use?.disabled && <span class="text-xs">{use.disabled}</span>}
                    </span>
                    {!!use?.usedThisActivation && <span class="badge badge-secondary shrink-0">Used</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {!phase && modes.length > 1 && (
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

        {weapon && (weapon.count > 1 || target.size > 1) && (
          <div class="flex flex-col gap-2">
            {weapon.count > 1 && (
              <Stepper label="Weapons attacking" value={copies} onChange={setWeaponCount} min={1} max={weapon.count} />
            )}
            {target.size > 1 && !weapon.special?.singleModel && (
              <Stepper label="Models in target" value={models} onChange={setTargetModels} min={1} max={target.size} />
            )}
          </div>
        )}

        {(controls.situations.length > 0 || controls.manual.length > 0) && (
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

        {(grantChoices.attacker.length > 0 || grantChoices.target.length > 0) && (
          <details class="collapse collapse-arrow bg-base-200">
            <summary class="collapse-title min-h-11 text-sm font-medium">
              Buffs, Marks and Debuffs{grants.length > 0 && <span class="font-normal opacity-70"> · {grants.length} on</span>}
            </summary>
            <div class="collapse-content flex flex-col gap-2">
              <GrantToggles title={`On ${unitName(attacker)}`} options={grantChoices.attacker} prefix="attacker" grants={grants} onToggle={toggleGrant} />
              <GrantToggles title={`On ${unitName(target)}`} options={grantChoices.target} prefix="target" grants={grants} onToggle={toggleGrant} />
            </div>
          </details>
        )}

        {resolved && (
          <>
            <section ref={readoutSection} class="card bg-base-200 scroll-mt-16">
              <div class="card-body p-4 gap-3">
                <AttackReadout attack={resolved} targetModels={models} targetTough={target.tough} />
                {weaponDisabled && (
                  <p role="status" class="text-sm">
                    {weaponLabel(weapon)}: {weaponDisabled}
                  </p>
                )}
                <button type="button" class="btn btn-primary h-11" disabled={!!weaponDisabled} onClick={doRoll}>
                  {currentRoll ? 'Roll again' : 'Roll'}
                </button>
                {currentRoll && <RollResult roll={currentRoll} />}
                {battle && (
                  <div class="flex flex-col gap-2 border-t border-base-content/10 pt-3">
                    <Stepper label="Wounds dealt" value={woundsToApply} onChange={setWoundsToApply} min={0} />
                    <button type="button" class="btn btn-secondary h-11" disabled={!!weaponDisabled} onClick={apply}>
                      Apply {woundsToApply} wound{woundsToApply === 1 ? '' : 's'} to {unitName(target)}
                    </button>
                    {applied && (
                      <p role="status" class="text-sm opacity-80">
                        ✓ {applied}
                      </p>
                    )}
                  </div>
                )}
                {battle && <ActivationButtons battle={battle} onBack={onBack} />}
              </div>
            </section>
            <RulesInPlay rules={resolved.rules} texts={ruleTexts} />
          </>
        )}
      </main>
    </div>
  )
}

function ActivationButtons({ battle, onBack }: { battle: BattleAttack; onBack: () => void }) {
  // After a spell the caster usually still has its action to take, so go back rather than end.
  if (battle.spell) {
    return (
      <button type="button" class="btn btn-outline h-11" onClick={onBack}>
        Back to activation
      </button>
    )
  }
  // A strike back happens inside the charger's activation, which the charger then ends.
  if (battle.strikeBack) {
    return (
      <button type="button" class="btn btn-outline h-11" onClick={battle.onEndStrikeBack}>
        End strike back
      </button>
    )
  }
  const melee = battle.state.activation?.melee
  const canStrikeBack = !battle.strikeBack && melee && !melee.struckBack && !isOut(battle.state.units[melee.target])
  return (
    <div class={`grid gap-2 ${canStrikeBack ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {canStrikeBack && (
        <button type="button" class="btn btn-outline h-11" onClick={battle.onStrikeBack}>
          Strike back
        </button>
      )}
      <button type="button" class="btn btn-outline h-11" onClick={battle.onEndActivation}>
        End activation
      </button>
    </div>
  )
}

/** Moves the next step into view, below the sticky header. */
function scrollTo(element: HTMLElement | null) {
  // Wait a frame so the section has re-rendered for the new choice.
  requestAnimationFrame(() => element?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

/** Melee weapons say so where ranged ones show their range, e.g. "Hand Weapon (Melee, A6)". */
function weaponLabel(w: ParsedWeapon): string {
  if (w.range > 0 || w.special) return w.label
  return w.label.includes('(') ? w.label.replace('(', '(Melee, ') : `${w.label} (Melee)`
}

/** Every target listed at once, like an open dropdown that stays open. */
function TargetList({
  title,
  units,
  selected,
  left,
  onPick,
}: {
  title: string
  units: ParsedUnit[]
  selected: string
  left: (unit: ParsedUnit) => number
  onPick: (id: string) => void
}) {
  return (
    <section class="flex flex-col gap-1" aria-label="Target">
      <h2 class="text-xs opacity-70">{title}</h2>
      <div class="flex flex-col divide-y divide-base-content/10 rounded-box border border-base-content/20 overflow-hidden" role="radiogroup">
        {units.map((u) => {
          const on = u.id === selected
          return (
            <button
              key={u.id}
              type="button"
              role="radio"
              aria-checked={on}
              class={`flex items-center justify-between gap-2 px-3 min-h-11 py-2 text-left ${on ? 'bg-primary text-primary-content' : 'bg-base-200'}`}
              onClick={() => onPick(u.id)}
            >
              <span class="min-w-0 truncate">{unitName(u)}</span>
              <span class="text-xs shrink-0 opacity-80">
                Q{u.quality}+ D{u.defense}+{u.tough > 1 ? ` · T${u.tough}` : ''} · {left(u)}/{u.size}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function UnitSelect({
  label,
  units,
  unit,
  onPick,
  locked,
  left,
}: {
  label: string
  units: ParsedUnit[]
  unit: ParsedUnit
  onPick: (id: string) => void
  locked: boolean
  left: number | null
}) {
  return (
    <label class="flex-1 min-w-0 flex flex-col gap-1">
      <span class="text-xs opacity-70 truncate">{label}</span>
      <select
        class="select select-bordered h-11 w-full"
        value={unit.id}
        disabled={locked}
        onChange={(e) => onPick((e.target as HTMLSelectElement).value)}
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {unitName(u)}
          </option>
        ))}
      </select>
      <span class="text-xs opacity-70">
        Q{unit.quality}+ D{unit.defense}+{unit.tough > 1 ? ` · Tough ${unit.tough}` : ''} ·{' '}
        {left !== null && left !== unit.size ? `${left}/${unit.size} models` : unit.size === 1 ? '1 model' : `${unit.size} models`}
      </span>
    </label>
  )
}

function GrantToggles({
  title,
  options,
  prefix,
  grants,
  onToggle,
}: {
  title: string
  options: GrantOption[]
  prefix: string
  grants: string[]
  onToggle: (id: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div class="flex flex-col gap-1">
      <span class="text-xs opacity-70">{title}</span>
      <div class="flex flex-wrap gap-2">
        {options.map((o) => {
          const id = `${prefix}:${o.label}`
          return <Toggle key={id} label={o.rule.name} hint={`Given by ${o.label}`} on={grants.includes(id)} onClick={() => onToggle(id)} />
        })}
      </div>
    </div>
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
