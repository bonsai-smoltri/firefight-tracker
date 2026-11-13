import { describe, expect, it } from 'vitest'
import robotLegions from './fixtures/robot-legions.json'
import { importSharedList, parseShareId, shareIdFromExport } from './import'

describe('parseShareId', () => {
  it.each([
    ['https://army-forge.onepagerules.com/share?id=0aXr7FGUX9X0&name=Robot_Legions%20GDFF%20300pt', '0aXr7FGUX9X0'],
    ['  qkjD919FloDu  ', 'qkjD919FloDu'],
    ['https://army-forge.onepagerules.com/share?name=x', null],
    ['not a link', null],
    ['https://example.com/?id=bad/id', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseShareId(input)).toBe(expected)
  })
})

describe('shareIdFromExport', () => {
  it('reads the list id from an Army Forge export file', () => {
    const file = JSON.stringify({ id: 'fBzDsM9BH6kk', gameSystem: 'gff', list: { units: [{ id: '3Tk4911' }] } })
    expect(shareIdFromExport(file)).toBe('fBzDsM9BH6kk')
  })

  it('rejects files that are not exports', () => {
    expect(() => shareIdFromExport('{oops')).toThrow(/isn't JSON/)
    expect(() => shareIdFromExport('{"name":"x"}')).toThrow(/Army Forge export/)
  })
})

const respond = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch

describe('importSharedList', () => {
  it('fetches the tts endpoint for the share id and parses the list', async () => {
    let requested = ''
    const fetchImpl = (async (url: string) => {
      requested = url
      return new Response(JSON.stringify(robotLegions))
    }) as typeof fetch
    const list = await importSharedList('https://army-forge.onepagerules.com/share?id=0aXr7FGUX9X0', fetchImpl)
    expect(requested).toBe('https://army-forge.onepagerules.com/api/tts?id=0aXr7FGUX9X0')
    expect(list.source).toEqual({ kind: 'share', shareId: '0aXr7FGUX9X0' })
    expect(list.units).toHaveLength(8)
  })

  it('gives readable errors', async () => {
    await expect(importSharedList('nope')).rejects.toThrow(/share link/)
    await expect(importSharedList('0aXr7FGUX9X0', respond(500, {}))).rejects.toThrow(/No list found.*500/)
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    await expect(importSharedList('0aXr7FGUX9X0', offline)).rejects.toThrow(/connection/)
  })
})
