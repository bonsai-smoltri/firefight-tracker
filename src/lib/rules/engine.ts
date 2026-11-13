import type { ParsedUnit, ParsedWeapon, RuleRef, RuleText } from '../../types/list.ts'
import {
  SITUATION_KEYS,
  manualKey,
  type AttackMode,
  type RuleConditions,
  type RuleEffects,
  type RuleMapping,
  type RulePart,
  type Situation,
  type SituationKey,
} from '../../types/rules.ts'
import { hashText } from './hash.ts'
import { resolveRule, type ResolveContext, type ResolvedRule } from './resolve.ts'

export interface AttackInput {
  attacker: ParsedUnit
  weapon: ParsedWeapon
  target: ParsedUnit
  mode: AttackMode
  situation: Situation
  context: ResolveContext
  /** Copies of the weapon still attacking. Defaults to the weapon's count. */
  weaponCount?: number
  /** Models left in the target, which caps Blast. Defaults to the target's size. */
  targetModels?: number
  /** Rules given to either unit by other units' Auras, Buffs, Debuffs and Marks. */
  granted?: { attacker?: RuleRef[]; target?: RuleRef[] }
  /** Names of manual rules switched on for this attack. */
  manual?: string[]
  /** Rule text by id from the imported lists. A mapping is skipped when its text hasn't been reviewed. */
  ruleTexts?: Record<string, RuleText>
}

export type RuleStatus = 'applied' | 'inactive' | 'replaced' | 'manual' | 'text' | 'grant' | 'unmapped' | 'unreviewed'

export interface RuleReport {
  /** Rule id from the list, for looking up its text. */
  id: string
  label: string
  /** Mapped rule name, when it differs from the label (aliases and wrappers). */
  resolvedAs: string | null
  owner: 'attacker' | 'weapon' | 'target'
  status: RuleStatus
  note?: string
}

export interface ResolvedAttack {
  mode: AttackMode
  dice: number
  /** Unmodified roll needed to hit. */
  hitOn: number
  /** Fatigued: only unmodified 6s hit, and they don't count as 6s for special rules. */
  onlySixes: boolean
  extraHitsOnSix: number
  extraAttacks: { count: number; on: number } | null
  blast: number
  ap: number
  /** Target's Defense after rules such as Armor, before modifiers. */
  defense: number
  /** Unmodified Defense roll needed to block. */
  blockOn: number
  /** Block roll against hits from unmodified 6s, when they carry extra AP. */
  blockOnSix: number | null
  rerollDefenseFrom: number | null
  extraWoundsOnOne: number
  woundMultiplier: number
  ignoreWoundsOn: number | null
  parry: number
  rules: RuleReport[]
  estimate: { hits: number; wounds: number }
}

interface Collected {
  effects: RuleEffects
  name: string
  isRegeneration: boolean
}

const clampRoll = (n: number) => Math.min(6, Math.max(2, n))

function conditionsMet(
  conditions: RuleConditions | undefined,
  mode: AttackMode,
  situation: Situation,
  target: { defense: number; tough: number },
) {
  if (!conditions) return true
  if (conditions.mode && conditions.mode !== mode) return false
  if (conditions.situation?.some((key) => !situation[key])) return false
  if (conditions.anySituation && !conditions.anySituation.some((key) => situation[key])) return false
  if (conditions.notSituation?.some((key) => situation[key])) return false
  if (conditions.targetDefense) {
    const [from, to] = conditions.targetDefense
    if (target.defense < from || target.defense > to) return false
  }
  if (conditions.targetToughAtLeast !== undefined && target.tough < conditions.targetToughAtLeast) return false
  return true
}

interface Owned {
  ref: RuleRef
  owner: RuleReport['owner']
  resolved: ResolvedRule
  /** Given by another unit (Aura, Buff, Mark) rather than held. */
  granted: boolean
}

function resolveAll(refs: RuleRef[], owner: RuleReport['owner'], context: ResolveContext, granted = false): Owned[] {
  return refs.map((ref) => ({ ref, owner, granted, resolved: resolveRule(ref.name, ref.rating, context, ref.label) }))
}

/** Text check: a mapping only counts for the texts it was reviewed against. */
function isReviewed(mapping: RuleMapping, ref: RuleRef, input: AttackInput): boolean {
  const checksThisName = mapping.name === ref.name || mapping.synthetic?.includes(ref.name)
  const text = checksThisName && ref.id ? input.ruleTexts?.[ref.id]?.description : undefined
  return text === undefined || mapping.reviewed.includes(hashText(text))
}

/**
 * Picks the parts of each rule that apply to this side of this attack. A rule counts once per
 * side even when several sources grant it, as OPR effects of the same rule don't stack.
 */
function collect(
  owned: Owned[],
  side: RulePart['side'],
  input: AttackInput,
  targetDefense: number,
  reports: RuleReport[],
): Collected[] {
  const mappedNames = new Set(owned.flatMap((o) => (o.resolved.kind === 'mapped' ? [o.resolved.mapping.name] : [])))
  const replaced = new Set(
    owned.flatMap((o) =>
      o.resolved.kind === 'mapped' && o.resolved.mapping.enhances && mappedNames.has(o.resolved.mapping.enhances)
        ? [o.resolved.mapping.enhances]
        : [],
    ),
  )
  const applied = new Set<string>()
  const out: Collected[] = []

  for (const { ref, owner, resolved, granted } of owned) {
    const report = (status: RuleStatus, resolvedAs: string | null = null, note?: string) =>
      reports.push({ id: ref.id, label: ref.label, resolvedAs, owner, status, note })

    if (resolved.kind === 'unmapped') {
      report('unmapped')
      continue
    }
    if (resolved.kind === 'grant') {
      report('grant', null, 'Given to other units')
      continue
    }

    const { mapping } = resolved
    const resolvedAs = mapping.name === ref.name ? null : mapping.name
    const ownSide = mapping.parts.length === 0 || mapping.parts.some((p) => p.side === side)
    if (!isReviewed(mapping, ref, input)) {
      // Reported once, by whichever side the rule has parts for.
      if (ownSide) report('unreviewed', null, 'This version of the rule has different text, so it isn’t in the maths')
      continue
    }
    if (mapping.armyWide && !granted) {
      if (ownSide) report('grant', resolvedAs, 'Toggle it under Buffs and Marks when attacking a marked unit')
      continue
    }
    const parts = mapping.parts.filter((p) => p.side === side)
    if (parts.length === 0) {
      // Rules for the other side are reported by that side's pass.
      if (mapping.parts.length === 0) report('text', resolvedAs, mapping.note)
      continue
    }
    if (replaced.has(mapping.name)) {
      report('replaced', resolvedAs, 'Replaced by its Enhanced version')
      continue
    }
    if (mapping.enhances && !mappedNames.has(mapping.enhances)) {
      report('inactive', resolvedAs, `Needs ${mapping.enhances}`)
      continue
    }
    if (applied.has(mapping.name)) continue

    const active = parts.filter(
      (p) =>
        (!resolved.mode || resolved.mode === input.mode) &&
        conditionsMet(p.conditions, input.mode, input.situation, { defense: targetDefense, tough: input.target.tough }),
    )
    const switchedOn = active.filter((p) => {
      const key = manualKey(mapping, p)
      return key === null || input.manual?.includes(key)
    })
    if (switchedOn.length === 0) {
      report(active.length > 0 ? 'manual' : 'inactive', resolvedAs, mapping.note)
      continue
    }

    applied.add(mapping.name)
    report('applied', resolvedAs, mapping.note)
    for (const part of switchedOn) {
      out.push({
        effects: typeof part.effects === 'function' ? part.effects(resolved.rating) : part.effects,
        name: mapping.name,
        isRegeneration: mapping.name === 'Regeneration',
      })
    }
  }
  return out
}

const sum = (items: Collected[], pick: (e: RuleEffects) => number | undefined) =>
  items.reduce((total, c) => total + (pick(c.effects) ?? 0), 0)
const values = (items: Collected[], pick: (e: RuleEffects) => number | undefined) =>
  items.map((c) => pick(c.effects)).filter((v): v is number => v !== undefined)
const any = (items: Collected[], pick: (e: RuleEffects) => boolean | undefined) => items.some((c) => pick(c.effects))

export function resolveAttack(input: AttackInput): ResolvedAttack {
  const { attacker, weapon, target, mode, situation, context } = input
  const reports: RuleReport[] = []

  const attackerRules = [
    ...resolveAll(attacker.rules, 'attacker', context),
    ...resolveAll(input.granted?.attacker ?? [], 'attacker', context, true),
    ...resolveAll(weapon.rules, 'weapon', context),
  ]
  const targetRules = [
    ...resolveAll(target.rules, 'target', context),
    ...resolveAll(input.granted?.target ?? [], 'target', context, true),
  ]

  // Defender first: Armor changes the Defense value that attacker conditions check.
  const defenderReports: RuleReport[] = []
  const defenseProbe = collect(targetRules, 'defender', input, target.defense, [])
  const defense = Math.min(target.defense, ...values(defenseProbe, (e) => e.defense))
  const def = collect(targetRules, 'defender', input, defense, defenderReports)
  const att = collect(attackerRules, 'attacker', input, defense, reports)
  reports.push(...defenderReports)

  const ignoresNegative = any(att, (e) => e.ignoresNegativeModifiers)
  const ignoresCover = any(att, (e) => e.ignoresCover)
  const ignoresRegeneration = any(att, (e) => e.ignoresRegeneration)

  const quality = Math.min(attacker.quality, ...values(att, (e) => e.quality))
  const defenderHitModifier = sum(def, (e) => e.hitModifier)
  const hitModifier =
    sum(att, (e) => e.hitModifier) + (ignoresNegative ? Math.max(0, defenderHitModifier) : defenderHitModifier)
  const onlySixes = mode === 'melee' && situation.attackerFatigued
  const hitOn = onlySixes ? 6 : clampRoll(quality - hitModifier)

  const apReduction = ignoresNegative ? 0 : sum(def, (e) => e.apReduction)
  const ap = Math.max(0, sum(att, (e) => e.ap) - apReduction)
  const apOnSix = onlySixes ? 0 : Math.max(0, ...values(att, (e) => e.apOnSix))
  const cover = mode === 'shooting' && situation.targetInCover && !ignoresCover ? 1 : 0
  const rawDefenseModifier = sum(def, (e) => e.defenseModifier) + cover
  const defenseModifier = any(att, (e) => e.ignoresDefenseBonuses) ? Math.min(0, rawDefenseModifier) : rawDefenseModifier
  const blockOn = clampRoll(defense - defenseModifier + ap)
  const blockOnSix = apOnSix > 0 ? clampRoll(defense - defenseModifier + ap + apOnSix) : null

  const extraAttackEffects = onlySixes ? [] : att.flatMap((c) => (c.effects.extraAttacks ? [c.effects.extraAttacks] : []))
  const extraAttacks = extraAttackEffects.length
    ? { count: Math.max(...extraAttackEffects.map((e) => e.count)), on: Math.min(...extraAttackEffects.map((e) => e.on)) }
    : null

  const ignoreWounds = def.filter((c) => c.effects.ignoreWoundsOn !== undefined && !(ignoresRegeneration && c.isRegeneration))
  const ignoreWoundsOn = ignoreWounds.length ? Math.min(...ignoreWounds.map((c) => c.effects.ignoreWoundsOn!)) : null

  const rerolls = values(att, (e) => e.rerollDefenseFrom)
  const resolved: Omit<ResolvedAttack, 'estimate'> = {
    mode,
    dice: weapon.attacks * (input.weaponCount ?? weapon.count),
    hitOn,
    onlySixes,
    extraHitsOnSix: onlySixes ? 0 : sum(att, (e) => e.extraHitsOnSix),
    extraAttacks,
    blast: Math.max(1, ...values(att, (e) => e.blast)),
    ap,
    defense,
    blockOn,
    blockOnSix,
    rerollDefenseFrom: rerolls.length ? Math.min(...rerolls) : null,
    extraWoundsOnOne: sum(att, (e) => e.extraWoundsOnOne),
    woundMultiplier: Math.max(1, ...values(att, (e) => e.woundMultiplier)),
    ignoreWoundsOn,
    parry: mode === 'melee' ? sum(def, (e) => e.parry) : 0,
    rules: reports,
  }
  return { ...resolved, estimate: estimate(resolved, target, input.targetModels ?? target.size) }
}

/** Probability of each final Defense face (index 1–6) after any re-roll of successful results. */
export function defenseFaces(blockOn: number, rerollFrom: number | null): number[] {
  const p = Array<number>(7).fill(0)
  for (let face = 1; face <= 6; face++) {
    const rerolled = rerollFrom !== null && face >= blockOn && face >= rerollFrom
    if (rerolled) for (let again = 1; again <= 6; again++) p[again] += 1 / 36
    else p[face] += 1 / 6
  }
  return p
}

function woundsPerHit(blockOn: number, attack: Omit<ResolvedAttack, 'estimate'>): number {
  const faces = defenseFaces(blockOn, attack.rerollDefenseFrom)
  const blocked = faces.reduce((total, p, face) => (face >= blockOn ? total + p : total), 0)
  return 1 - blocked + faces[1] * attack.extraWoundsOnOne
}

/** Distribution of total hits from all attacks, for capping Blast. */
function hitDistribution(attack: Omit<ResolvedAttack, 'estimate'>): number[] {
  const convolve = (a: number[], b: number[]) => {
    const out = Array<number>(a.length + b.length - 1).fill(0)
    a.forEach((pa, i) => b.forEach((pb, j) => (out[i + j] += pa * pb)))
    return out
  }
  const single = (canSpawn: boolean): number[] => {
    const total: number[] = []
    for (let face = 1; face <= 6; face++) {
      const hit = attack.onlySixes ? face === 6 : face >= attack.hitOn
      const hits = !hit ? 0 : 1 + (face === 6 && !attack.onlySixes ? attack.extraHitsOnSix : 0)
      let outcome = Array<number>(hits + 1).fill(0)
      outcome[hits] = 1
      if (canSpawn && hit && attack.extraAttacks && face >= attack.extraAttacks.on) {
        for (let i = 0; i < attack.extraAttacks.count; i++) outcome = convolve(outcome, single(false))
      }
      outcome.forEach((p, i) => (total[i] = (total[i] ?? 0) + p / 6))
    }
    return total
  }
  const perAttack = single(true)
  let dist = [1]
  for (let i = 0; i < attack.dice; i++) dist = convolve(dist, perAttack)
  return dist
}

function estimate(attack: Omit<ResolvedAttack, 'estimate'>, target: ParsedUnit, targetModels: number) {
  const pHit = attack.onlySixes ? 1 / 6 : (7 - attack.hitOn) / 6
  const pSix = attack.onlySixes ? 0 : 1 / 6
  const spawn = attack.extraAttacks
    ? attack.extraAttacks.count * ((7 - Math.max(attack.extraAttacks.on, attack.hitOn)) / 6)
    : 0
  const attacks = attack.dice * (1 + spawn)

  let sixHits = attacks * pSix
  let normalHits = attacks * (pHit - pSix) + sixHits * attack.extraHitsOnSix
  let hits = sixHits + normalHits

  if (attack.blast > 1 && hits > 0) {
    const dist = hitDistribution(attack)
    const capped = dist.reduce((total, p, h) => total + p * Math.min(h * attack.blast, targetModels), 0)
    const scale = capped / hits
    sixHits *= scale
    normalHits *= scale
    hits = capped
  }

  if (attack.parry > 0 && hits > 0) {
    const ignored = Math.min(hits, attack.parry * targetModels) / 6
    const scale = (hits - ignored) / hits
    sixHits *= scale
    normalHits *= scale
    hits -= ignored
  }

  let wounds =
    sixHits * woundsPerHit(attack.blockOnSix ?? attack.blockOn, attack) + normalHits * woundsPerHit(attack.blockOn, attack)
  if (attack.woundMultiplier > 1) wounds *= Math.min(attack.woundMultiplier, target.tough)
  if (attack.ignoreWoundsOn !== null) wounds *= 1 - (7 - attack.ignoreWoundsOn) / 6

  return { hits, wounds }
}

const BASE_SITUATIONS: Record<AttackMode, SituationKey[]> = {
  shooting: ['targetInCover'],
  melee: ['charging', 'attackerFatigued'],
}

/** The situation toggles and manual rules that can change this attack, so the UI only shows those. */
export function attackControls(
  input: Pick<AttackInput, 'attacker' | 'weapon' | 'target' | 'mode' | 'context' | 'granted'>,
): { situations: SituationKey[]; manual: string[] } {
  const keys = new Set<SituationKey>(BASE_SITUATIONS[input.mode])
  const manual = new Set<string>()
  const held = (refs: RuleRef[]) => refs.map((ref) => ({ ref, granted: false }))
  const given = (refs: RuleRef[] = []) => refs.map((ref) => ({ ref, granted: true }))
  const sides: [{ ref: RuleRef; granted: boolean }[], RulePart['side']][] = [
    [[...held([...input.attacker.rules, ...input.weapon.rules]), ...given(input.granted?.attacker)], 'attacker'],
    [[...held(input.target.rules), ...given(input.granted?.target)], 'defender'],
  ]
  for (const [refs, side] of sides) {
    for (const { ref, granted } of refs) {
      const resolved = resolveRule(ref.name, ref.rating, input.context, ref.label)
      if (resolved.kind !== 'mapped' || (resolved.mode && resolved.mode !== input.mode)) continue
      if (resolved.mapping.armyWide && !granted) continue
      for (const part of resolved.mapping.parts) {
        if (part.side !== side || (part.conditions?.mode && part.conditions.mode !== input.mode)) continue
        const c = part.conditions
        ;[...(c?.situation ?? []), ...(c?.anySituation ?? []), ...(c?.notSituation ?? [])].forEach((key) => keys.add(key))
        const key = manualKey(resolved.mapping, part)
        if (key) manual.add(key)
      }
    }
  }
  return { situations: SITUATION_KEYS.filter((key) => keys.has(key)), manual: [...manual] }
}

/** Shooting for ranged weapons, melee for range 0; Assault weapons can do both. */
export function weaponModes(weapon: ParsedWeapon): AttackMode[] {
  if (weapon.rules.some((r) => r.name === 'Assault')) return ['shooting', 'melee']
  return weapon.range > 0 ? ['shooting'] : ['melee']
}
