import type { BattleRecord } from '../lib/storage'

export function recordHeadline(record: BattleRecord): string {
  const { listNames, round, complete } = record.state
  const vs = `${listNames.A} vs ${listNames.B}`
  if (!complete) return `${vs} · abandoned in round ${round}`
  return `${vs} · ${record.winner === 'draw' || !record.winner ? 'draw' : `${listNames[record.winner]} won`}`
}

interface Props {
  records: BattleRecord[]
  onOpen: (record: BattleRecord) => void
}

export function HistoryList({ records, onOpen }: Props) {
  if (records.length === 0) return null
  return (
    <section class="flex flex-col gap-2" aria-label="Past battles">
      <h2 class="text-sm font-semibold opacity-70">Past battles</h2>
      <ul class="flex flex-col divide-y divide-base-content/10 bg-base-200 rounded-box">
        {records.map((record) => (
          <li key={record.state.id}>
            <button type="button" class="w-full text-left px-4 py-3 min-h-11 flex flex-col" onClick={() => onOpen(record)}>
              <span class="text-sm">{recordHeadline(record)}</span>
              <span class="text-xs opacity-60">{new Date(record.savedAt).toLocaleDateString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
