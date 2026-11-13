// Downloads Firefight core rules and official army books from Army Forge into src/data.
// Usage: npm run sync
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArmyBook, SyncManifest } from '../src/types/army-book.ts'
import { firefightBooks, trimBook, trimCoreRules, urls } from './sync/army-forge.ts'
import { buildManifest, diffManifests } from './sync/manifest.ts'
import { formatReport } from './sync/report.ts'

const DATA_DIR = join(import.meta.dirname, '..', 'src', 'data')
const BOOKS_DIR = join(DATA_DIR, 'books')
const MANIFEST_PATH = join(DATA_DIR, 'manifest.json')
const REQUEST_GAP_MS = 500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

const writeJson = (path: string, data: unknown) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)

async function main() {
  const previous: SyncManifest | null = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    : null

  console.log('Fetching core rules and book index')
  const core = trimCoreRules(await fetchJson(urls.coreRules()))
  const index = firefightBooks(await fetchJson(urls.bookIndex()))

  const books: ArmyBook[] = []
  for (const [i, entry] of index.entries()) {
    await sleep(REQUEST_GAP_MS)
    console.log(`[${i + 1}/${index.length}] ${entry.name}`)
    books.push(trimBook(await fetchJson(urls.book(entry.uid))))
  }

  mkdirSync(BOOKS_DIR, { recursive: true })
  for (const file of readdirSync(BOOKS_DIR)) rmSync(join(BOOKS_DIR, file))
  writeJson(join(DATA_DIR, 'core-rules.json'), core)
  for (const book of books) writeJson(join(BOOKS_DIR, `${book.uid}.json`), book)

  const manifest = buildManifest(core, books, new Date().toISOString())
  writeJson(MANIFEST_PATH, manifest)

  const report = formatReport({ core, books, manifest, diff: diffManifests(previous, manifest), firstSync: !previous })
  writeFileSync(join(DATA_DIR, 'sync-report.md'), `${report}\n`)
  console.log(`\n${report}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
