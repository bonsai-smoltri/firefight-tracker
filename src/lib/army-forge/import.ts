import type { ParsedList } from '../../types/list'
import { ListParseError, parseTtsList } from './tts'

const LIST_URL = 'https://army-forge.onepagerules.com/api/tts?id='
const SHARE_ID = /^[A-Za-z0-9_-]{6,32}$/

/** Accepts a full share link (`.../share?id=X&name=Y`) or a bare share id. */
export function parseShareId(input: string): string | null {
  const text = input.trim()
  if (SHARE_ID.test(text)) return text
  try {
    const id = new URL(text).searchParams.get('id')
    return id && SHARE_ID.test(id) ? id : null
  } catch {
    return null
  }
}

/**
 * An Army Forge export file only holds unit and upgrade ids, so it's resolved by fetching the
 * same list through its id rather than rebuilding Army Forge's upgrade logic.
 */
export function shareIdFromExport(text: string): string {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ListParseError("That file isn't JSON.")
  }
  const id = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).id : null
  if (typeof id !== 'string' || !SHARE_ID.test(id)) {
    throw new ListParseError("That file doesn't look like an Army Forge export.")
  }
  return id
}

export async function importSharedList(input: string, fetchImpl: typeof fetch = fetch): Promise<ParsedList> {
  const shareId = parseShareId(input)
  if (!shareId) throw new ListParseError('Paste an Army Forge share link, e.g. army-forge.onepagerules.com/share?id=…')

  let response: Response
  try {
    response = await fetchImpl(LIST_URL + encodeURIComponent(shareId))
  } catch {
    throw new ListParseError("Couldn't reach Army Forge. Check your connection and try again.")
  }
  if (!response.ok) {
    throw new ListParseError(
      // Army Forge answers an unknown id with a 500, so that can't be told apart from an outage.
      `No list found for that link, or Army Forge is down (error ${response.status}).`,
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ListParseError("Army Forge didn't return a list.")
  }
  return parseTtsList(body, shareId, new Date().toISOString())
}
