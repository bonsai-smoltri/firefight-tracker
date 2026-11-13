import { useEffect, useState } from 'preact/hooks'
import { castBlocked, castSucceeds, castingModifier, isOut } from '../lib/battle'
import { rollD6 } from '../lib/rules/dice'
import { spellAttack } from '../lib/rules/spell-attacks'
import { loadSpells } from '../lib/spells'
import type { ParsedWeapon } from '../types/list'
import type { BookSpell } from '../types/army-book'
import type { BattleState, SpellCast, UnitKey } from '../types/battle'
import { Stepper } from './Stepper'

interface Props {
  state: BattleState
  caster: UnitKey
  armyId: string
  /** Spell Amplifier: +1 to casting rolls. */
  amplified: boolean
  onCast: (cast: SpellCast) => void
  /** A successful spell that deals hits, to resolve on the attack screen. */
  onResolveHits: (attack: ParsedWeapon) => void
  onClose: () => void
}

/** Pick a spell, add help from other casters, roll 4+, then record the result. */
export function CastPanel({ state, caster, armyId, amplified, onCast, onResolveHits, onClose }: Props) {
  const [spells, setSpells] = useState<BookSpell[] | null>(null)
  const [picked, setPicked] = useState<BookSpell | null>(null)
  const [helpers, setHelpers] = useState<Record<UnitKey, number>>({})
  const [face, setFace] = useState<number | null>(null)
  /** Hits from the spell just cast, waiting to be resolved. */
  const [resolve, setResolve] = useState<ParsedWeapon | null>(null)

  useEffect(() => {
    let live = true
    void loadSpells(armyId).then((s) => live && setSpells(s))
    return () => {
      live = false
    }
  }, [armyId])

  const unit = state.units[caster]
  const others = Object.values(state.units).filter((u) => u.key !== caster && u.caster !== null && u.spellTokens > 0 && !isOut(u))
  const modifier = castingModifier(state, { caster, helpers }, amplified)
  const finish = (succeeded: boolean) => {
    if (!picked) return
    onCast({ caster, spell: picked.name, cost: picked.threshold, helpers, succeeded })
    if (succeeded) {
      const attack = spellAttack(picked)
      if (attack) setResolve(attack)
    }
    setPicked(null)
    setHelpers({})
    setFace(null)
  }

  return (
    <div class="flex flex-col gap-2 rounded-box border border-base-content/20 p-3" aria-label="Cast a spell">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-sm">
          Cast a spell · {unit.spellTokens} token{unit.spellTokens === 1 ? '' : 's'}
        </span>
        <button type="button" class="btn btn-ghost btn-sm h-9 min-h-9" onClick={onClose}>
          Close
        </button>
      </div>

      {resolve && (
        <div class="flex flex-col gap-2 rounded-box bg-base-300 p-3">
          <p class="text-sm">
            <span class="font-medium">{resolve.name}</span> succeeded. {resolve.special?.when}
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn btn-primary h-11" onClick={() => onResolveHits(resolve)}>
              Resolve hits
            </button>
            <button type="button" class="btn btn-ghost h-11" onClick={() => setResolve(null)}>
              Skip
            </button>
          </div>
        </div>
      )}

      {spells === null && <span class="loading loading-spinner loading-sm" aria-label="Loading spells" />}
      {spells?.length === 0 && <p class="text-sm opacity-70">No spells found for this army.</p>}

      {!picked &&
        spells?.map((spell) => {
          const blocked = castBlocked(state, caster, spell.name, spell.threshold)
          return (
            <button
              key={spell.id}
              type="button"
              class="btn h-auto min-h-11 py-2 justify-start text-left font-normal btn-ghost border border-base-content/20"
              disabled={blocked !== null}
              onClick={() => setPicked(spell)}
            >
              <span class="flex flex-col items-start gap-0.5">
                <span class="font-medium">
                  {spell.name} <span class="opacity-70">({spell.threshold})</span>
                </span>
                <span class="text-xs opacity-80">{spell.effect}</span>
                {blocked && <span class="text-xs opacity-70">{blocked}</span>}
              </span>
            </button>
          )
        })}

      {picked && (
        <div class="flex flex-col gap-2">
          <div>
            <div class="font-medium">
              {picked.name} <span class="opacity-70">({picked.threshold} token{picked.threshold === 1 ? '' : 's'})</span>
            </div>
            <p class="text-xs opacity-80">{picked.effect}</p>
          </div>

          {others.length > 0 && (
            <div class="flex flex-col gap-2">
              <span class="text-xs opacity-70">Casters within 18" may spend tokens: friendly +1 each, enemy -1 each.</span>
              {others.map((u) => (
                <Stepper
                  key={u.key}
                  label={`${u.name} (${u.player === unit.player ? 'helps' : 'hinders'})`}
                  value={helpers[u.key] ?? 0}
                  onChange={(n) => setHelpers({ ...helpers, [u.key]: n })}
                  max={u.spellTokens}
                />
              ))}
            </div>
          )}

          <p class="text-sm">
            Succeeds on <span class="font-bold">4+</span>
            {modifier !== 0 && ` with ${modifier > 0 ? '+' : ''}${modifier}`}
            {amplified && <span class="opacity-70"> (Spell Amplifier +1)</span>}
          </p>

          {face !== null && (
            <p class="text-sm" aria-live="polite">
              Rolled <span class="font-mono font-bold text-lg">{face}</span>: {castSucceeds(face, modifier) ? 'success' : 'failed'}
            </p>
          )}

          <div class="grid grid-cols-3 gap-2">
            <button type="button" class="btn h-11" onClick={() => setFace(rollD6())}>
              Roll
            </button>
            <button type="button" class="btn btn-primary h-11" onClick={() => finish(true)}>
              Success
            </button>
            <button type="button" class="btn btn-outline h-11" onClick={() => finish(false)}>
              Failed
            </button>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm h-9 min-h-9"
            onClick={() => {
              setPicked(null)
              setHelpers({})
              setFace(null)
            }}
          >
            Pick another spell
          </button>
        </div>
      )}
    </div>
  )
}
