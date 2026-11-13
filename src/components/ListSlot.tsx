import { useState } from 'preact/hooks'
import { importSharedList, shareIdFromExport } from '../lib/army-forge/import'
import type { ParsedList } from '../types/list'
import { UnitSummary } from './UnitSummary'

interface Props {
  label: string
  list: ParsedList | null
  onImported: (list: ParsedList) => void
  onClear: () => void
}

export function ListSlot({ label, list, onImported, onClear }: Props) {
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replacing, setReplacing] = useState(false)

  const run = async (input: () => Promise<string> | string) => {
    setBusy(true)
    setError(null)
    try {
      onImported(await importSharedList(await input()))
      setLink('')
      setReplacing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const showForm = !list || replacing

  return (
    <section class="card bg-base-200" aria-label={label}>
      <div class="card-body p-4 gap-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="card-title text-base">{label}</h2>
          {list && (
            <div class="flex gap-1">
              <button type="button" class="btn btn-ghost btn-sm min-h-9" onClick={() => setReplacing(!replacing)}>
                {replacing ? 'Cancel' : 'Replace'}
              </button>
              <button type="button" class="btn btn-ghost btn-sm min-h-9 text-error" onClick={onClear}>
                Remove
              </button>
            </div>
          )}
        </div>

        {showForm && (
          <form
            class="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void run(() => link)
            }}
          >
            <input
              type="url"
              class="input input-bordered w-full h-11"
              placeholder="Army Forge share link"
              aria-label={`${label} share link`}
              value={link}
              onInput={(e) => setLink((e.target as HTMLInputElement).value)}
              disabled={busy}
            />
            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary h-11 flex-1" disabled={busy || !link.trim()}>
                {busy ? <span class="loading loading-spinner loading-sm" aria-label="Importing" /> : 'Import'}
              </button>
              <label class={`btn btn-outline h-11 flex-1 ${busy ? 'btn-disabled' : ''}`}>
                Export file
                <input
                  type="file"
                  accept=".json,application/json"
                  class="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const input = e.target as HTMLInputElement
                    const file = input.files?.[0]
                    input.value = ''
                    if (file) void run(async () => shareIdFromExport(await file.text()))
                  }}
                />
              </label>
            </div>
          </form>
        )}

        {error && (
          <div role="alert" class="alert alert-error py-2 text-sm">
            <span>{error}</span>
          </div>
        )}

        {list && <ListDetails list={list} />}
      </div>
    </section>
  )
}

function ListDetails({ list }: { list: ParsedList }) {
  return (
    <div class="flex flex-col gap-2">
      <p class="text-sm">
        <span class="font-semibold">{list.name}</span>
        <span class="opacity-70">
          {' '}
          · {list.points}pts · {list.units.length} units
        </span>
      </p>

      {list.warnings.length > 0 && (
        <div role="alert" class="alert alert-warning py-2 text-xs items-start">
          <ul class="list-disc list-inside">
            {list.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {list.listErrors.length > 0 && (
        <details class="text-xs opacity-80">
          <summary class="cursor-pointer min-h-9 flex items-center">
            Army Forge list-building issues ({list.listErrors.length})
          </summary>
          <ul class="list-disc list-inside pt-1">
            {list.listErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      <ul class="flex flex-col divide-y divide-base-content/10">
        {list.units.map((unit) => (
          <li key={unit.id} class="py-2">
            <UnitSummary unit={unit} list={list} />
          </li>
        ))}
      </ul>
    </div>
  )
}
