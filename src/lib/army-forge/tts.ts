import bundledCoreRules from '../../data/core-rules.json'
import type { CoreRules } from '../../types/army-book'
import type { ParsedList, ParsedUnit, ParsedWeapon, RuleRef, RuleText } from '../../types/list'

/** Thrown when the response isn't a usable Firefight list. The message is shown to the user. */
export class ListParseError extends Error {}

type Raw = Record<string, unknown>

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)
const array = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isObject) : [])
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Some weapon rules arrive without an id or rule text; those are filled in from the core rules by name. */
function ruleRef(raw: Raw): RuleRef | null {
  const name = str(raw.name)
  if (!name) return null
  const rating = num(raw.rating)
  return { id: str(raw.id) ?? '', name, rating, label: str(raw.label) ?? (rating === null ? name : `${name}(${rating})`) }
}

const ruleRefs = (value: unknown) => array(value).map(ruleRef).filter((r): r is RuleRef => r !== null)

function weapon(raw: Raw, unitName: string, warnings: string[]): ParsedWeapon | null {
  const name = str(raw.name)
  const attacks = num(raw.attacks)
  if (!name || attacks === null) {
    warnings.push(`${unitName}: skipped a weapon with no name or attacks`)
    return null
  }
  return {
    name,
    label: str(raw.label) ?? name,
    range: num(raw.range) ?? 0,
    attacks: attacks * (num(raw.attacksMultiplier) ?? 1),
    count: num(raw.count) ?? 1,
    rules: ruleRefs(raw.specialRules),
  }
}

/** Upgrade costs are listed per unit id; fall back to the first when none match. */
function upgradeCost(raw: Raw, unitId: string | null): number {
  return array(raw.selectedUpgrades).reduce((total, selected) => {
    const option = isObject(selected.option) ? selected.option : {}
    const costs = array(option.costs)
    const cost = costs.find((c) => c.unitId === unitId) ?? costs[0]
    return total + (num(cost?.cost) ?? 0)
  }, 0)
}

function unit(raw: Raw, index: number, warnings: string[]): ParsedUnit | null {
  const customName = str(raw.customName) || null
  const name = str(raw.name) || `Unit ${index + 1}`
  const shown = customName ?? name
  const id = str(raw.selectionId)
  const quality = num(raw.quality)
  const defense = num(raw.defense)
  if (!id || quality === null || defense === null) {
    warnings.push(`${shown}: skipped, missing id, Quality or Defense`)
    return null
  }

  const rules = ruleRefs(raw.rules)
  const weapons: ParsedWeapon[] = []
  for (const entry of array(raw.loadout)) {
    if (entry.type === 'ArmyBookWeapon') {
      const parsed = weapon(entry, shown, warnings)
      if (parsed) weapons.push(parsed)
    } else if (entry.type === 'ArmyBookItem') {
      for (const content of array(entry.content)) {
        if (content.type === 'ArmyBookRule') {
          const ref = ruleRef(content)
          if (ref) rules.push(ref)
        } else if (content.type === 'ArmyBookWeapon') {
          const parsed = weapon(content, shown, warnings)
          if (parsed) weapons.push(parsed)
        } else {
          warnings.push(`${shown}: ignored ${String(content.type)} in ${String(entry.name)}`)
        }
      }
    } else {
      warnings.push(`${shown}: ignored loadout entry of type ${String(entry.type)}`)
    }
  }

  if (raw.combined === true) warnings.push(`${shown}: combined units aren't supported yet, treated as one unit`)
  if (raw.valid === false) warnings.push(`${shown}: Army Forge marks this unit as invalid`)

  return {
    id,
    name,
    customName,
    size: num(raw.size) ?? 1,
    quality,
    defense,
    tough: rules.find((r) => r.name === 'Tough')?.rating ?? 1,
    points: (num(raw.cost) ?? 0) + upgradeCost(raw, str(raw.id)),
    rules,
    weapons,
    joinedTo: str(raw.joinToUnit),
    caster: rules.find((r) => r.name === 'Caster')?.rating ?? null,
    armyId: str(raw.armyId) ?? '',
  }
}

/** Parses the JSON from Army Forge's `/api/tts?id=` endpoint. */
export function parseTtsList(
  raw: unknown,
  shareId: string,
  importedAt: string,
  coreRules: CoreRules = bundledCoreRules,
): ParsedList {
  if (!isObject(raw) || !Array.isArray(raw.units)) {
    throw new ListParseError("That doesn't look like an Army Forge list.")
  }
  if (raw.gameSystem !== 'gff') {
    throw new ListParseError(`This list is for ${String(raw.gameSystem ?? 'another game')}, not Grimdark Future: Firefight.`)
  }

  const warnings: string[] = []
  const units = array(raw.units)
    .map((u, i) => unit(u, i, warnings))
    .filter((u): u is ParsedUnit => u !== null)
  if (units.length === 0) throw new ListParseError('This list has no units.')

  const ids = new Set(units.map((u) => u.id))
  for (const u of units) {
    if (u.joinedTo && !ids.has(u.joinedTo)) {
      warnings.push(`${u.customName ?? u.name}: joined to a unit that isn't in the list, treated as separate`)
      u.joinedTo = null
    }
  }

  const rules: Record<string, RuleText> = {}
  for (const r of array(raw.specialRules)) {
    const id = str(r.id)
    const name = str(r.name)
    if (id && name) rules[id] = { name, description: str(r.description) ?? '', aliasedRuleId: str(r.aliasedRuleId) }
  }

  const idsByName = new Map(Object.entries(rules).map(([id, r]) => [r.name, id]))
  const missing = new Set<string>()
  for (const ref of units.flatMap((u) => [...u.rules, ...u.weapons.flatMap((w) => w.rules)])) {
    if (ref.id) continue
    const known = idsByName.get(ref.name)
    const core = known ? null : coreRules.rules.find((r) => r.name === ref.name)
    if (core) {
      rules[core.id] = { name: core.name, description: core.description, aliasedRuleId: core.aliasedRuleId }
      idsByName.set(core.name, core.id)
    }
    ref.id = known ?? core?.id ?? ''
    if (!ref.id) missing.add(ref.name)
  }
  if (missing.size) warnings.push(`No rule text for: ${[...missing].join(', ')}`)

  const points = units.reduce((total, u) => total + u.points, 0)
  const listPoints = num(raw.listPoints)
  if (listPoints !== null && listPoints !== points) {
    warnings.push(`Unit points add up to ${points}, but Army Forge says ${listPoints}`)
  }

  return {
    source: { kind: 'share', shareId },
    name: str(raw.name) || 'Unnamed list',
    points: listPoints ?? points,
    pointsLimit: num(raw.pointsLimit),
    units,
    rules,
    listErrors: Array.isArray(raw.forceOrgErrors) ? raw.forceOrgErrors.filter((e): e is string => typeof e === 'string') : [],
    warnings,
    importedAt,
  }
}
