import type { ParsedList, ParsedUnit } from '../types/list'

interface Props {
  unit: ParsedUnit
  list: ParsedList
}

export function UnitSummary({ unit, list }: Props) {
  const joinedTo = unit.joinedTo ? list.units.find((u) => u.id === unit.joinedTo) : null
  const ruleText = (id: string) => list.rules[id]?.description || undefined

  return (
    <div class="flex flex-col gap-1 text-sm">
      <div class="flex items-baseline justify-between gap-2">
        <span class="font-medium">
          {unit.customName ?? unit.name}
          {unit.customName && <span class="opacity-60 font-normal"> ({unit.name})</span>}
        </span>
        <span class="opacity-60 text-xs shrink-0">{unit.points}pts</span>
      </div>

      <div class="flex flex-wrap gap-1 text-xs">
        <span class="badge badge-neutral">{unit.size === 1 ? '1 model' : `${unit.size} models`}</span>
        <span class="badge badge-neutral">Q{unit.quality}+</span>
        <span class="badge badge-neutral">D{unit.defense}+</span>
        {unit.tough > 1 && <span class="badge badge-neutral">Tough {unit.tough}</span>}
        {unit.caster !== null && <span class="badge badge-neutral">Caster {unit.caster}</span>}
        {joinedTo && <span class="badge badge-outline">Joined to {joinedTo.customName ?? joinedTo.name}</span>}
      </div>

      <ul class="text-xs opacity-80">
        {unit.weapons.map((w) => (
          <li key={w.label}>
            {w.count > 1 && `${w.count}× `}
            {w.label}
          </li>
        ))}
      </ul>

      {unit.rules.length > 0 && (
        <p class="text-xs opacity-60">
          {unit.rules.map((r, i) => (
            <span key={`${r.id}-${i}`} title={ruleText(r.id)}>
              {i > 0 && ', '}
              {r.label}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
