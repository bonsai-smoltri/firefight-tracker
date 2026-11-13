import type { RuleReport, RuleStatus } from '../lib/rules/engine'
import type { RuleText } from '../types/list'

const STATUS_LABEL: Record<RuleStatus, string> = {
  applied: 'In the maths',
  inactive: 'Not this attack',
  replaced: 'Replaced',
  manual: 'Switched off',
  text: 'No maths',
  grant: 'For other units',
  unmapped: 'Not modelled',
  unreviewed: 'Not modelled',
}

const ORDER: RuleStatus[] = ['applied', 'manual', 'inactive', 'unmapped', 'unreviewed', 'replaced', 'grant', 'text']
const OWNER_LABEL = { attacker: 'Attacker', weapon: 'Weapon', target: 'Target' } as const

interface Props {
  rules: RuleReport[]
  texts: Record<string, RuleText>
}

export function RulesInPlay({ rules, texts }: Props) {
  const sorted = [...rules].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  const notModelled = rules.filter((r) => r.status === 'unmapped' || r.status === 'unreviewed').length

  return (
    <details class="collapse collapse-arrow bg-base-200">
      <summary class="collapse-title min-h-11 text-sm font-medium">
        Rules in play ({rules.length})
        {notModelled > 0 && <span class="opacity-70 font-normal"> · {notModelled} not modelled</span>}
      </summary>
      <div class="collapse-content">
        <ul class="flex flex-col divide-y divide-base-content/10">
          {sorted.map((rule, i) => (
            <li key={`${rule.owner}-${rule.label}-${i}`} class="py-2 text-sm">
              <div class="flex items-baseline justify-between gap-2">
                <span class={rule.status === 'applied' ? 'font-semibold' : ''}>
                  {rule.label}
                  {rule.resolvedAs && <span class="opacity-60 font-normal"> (as {rule.resolvedAs})</span>}
                </span>
                <span class="text-xs opacity-70 shrink-0">
                  {OWNER_LABEL[rule.owner]} · {STATUS_LABEL[rule.status]}
                </span>
              </div>
              {rule.note && <p class="text-xs opacity-70">{rule.note}</p>}
              {texts[rule.id]?.description && <p class="text-xs opacity-60 pt-0.5">{texts[rule.id].description}</p>}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
