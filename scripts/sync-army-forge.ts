// Downloads Firefight core rules and official army books from Army Forge into src/data.
// Usage: npm run sync            fetch everything and compare against the last sync
//        npm run sync -- --offline   rebuild the index, manifest and report from src/data
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArmyBook, CoreRules, SyncManifest } from '../src/types/army-book.ts'
import { firefightBooks, trimBook, trimCoreRules, urls } from './sync/army-forge.ts'
import { buildManifest, diffManifests } from './sync/manifest.ts'
import { buildRuleIndex, formatReport } from './sync/report.ts'

const DATA_DIR = join(import.meta.dirname, '..', 'src', 'data')
const BOOKS_DIR = join(DATA_DIR, 'books')
const CORE_PATH = join(DATA_DIR, 'core-rules.json')
const MANIFEST_PATH = join(DATA_DIR, 'manifest.json')
const REQUEST_GAP_MS = 500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path: string, data: unknown) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

async function download(): Promise<{ core: CoreRules; books: ArmyBook[] }> {
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
  writeJson(CORE_PATH, core)
  for (const book of books) writeJson(join(BOOKS_DIR, `${book.uid}.json`), book)
  return { core, books }
}

function readBundled(): { core: CoreRules; books: ArmyBook[] } {
  const core = readJson<CoreRules>(CORE_PATH)
  const books = readdirSync(BOOKS_DIR)
    .sort()
    .map((file) => readJson<ArmyBook>(join(BOOKS_DIR, file)))
  return { core, books }
}

async function main() {
  const offline = process.argv.includes('--offline')
  const previous: SyncManifest | null = existsSync(MANIFEST_PATH) && !offline ? readJson(MANIFEST_PATH) : null

  const { core, books } = offline ? readBundled() : await download()
  const manifest = buildManifest(core, books, offline && existsSync(MANIFEST_PATH) ? readJson<SyncManifest>(MANIFEST_PATH).syncedAt : new Date().toISOString())
  writeJson(MANIFEST_PATH, manifest)
  writeJson(join(DATA_DIR, 'rule-index.json'), buildRuleIndex(core, books))

  const report = formatReport({ core, books, manifest, diff: previous ? diffManifests(previous, manifest) : null })
  writeFileSync(join(DATA_DIR, 'sync-report.md'), `${report}\n`)
  console.log(`\n${report.split('\n## Unmapped')[0]}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
