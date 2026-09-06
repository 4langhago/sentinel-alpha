// 저장된 공매 물건의 시도 분류를 주소로 다시 판정한다.
//
// 왜 필요한가: 온비드가 2026 개편으로 '전남광주통합특별시'를 쓰기 시작했는데,
// 우리는 한동안 이걸 통째로 '광주'로 분류했다. 그 뒤 판정 로직은 고쳤지만,
// **이미 마감돼 API가 더 이상 주지 않는 물건**은 재수집으로 고쳐지지 않는다.
// 그래서 저장된 address를 근거로 한 번 교정한다.
//
//   npm run auction:repair-sido            (로컬 샤드 교정)
//   npm run auction:repair-sido -- --dry   (무엇이 바뀔지만 보기)
//
// 교정 후 npm run blobs:upload -- auctions 로 운영에 반영한다.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { writeJsonAtomic } from './lib/writeShard.mjs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAuctionShards } from '../netlify/functions/lib/auctionStorage.mjs'
import { resolveSido } from '../netlify/functions/lib/onbidCodes.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'netlify/functions/data/auction')
const dry = process.argv.includes('--dry')

if (!existsSync(join(DIR, 'index.json'))) {
  console.error(`로컬 공매 데이터가 없습니다: ${DIR}`)
  process.exit(1)
}

/** 시군구 샤드 + orphan을 모아 전체 물건을 복원한다. */
const all = []
for (const f of readdirSync(join(DIR, 'sgg'))) {
  all.push(...JSON.parse(readFileSync(join(DIR, 'sgg', f), 'utf8')).items)
}
if (existsSync(join(DIR, 'orphan.json'))) {
  all.push(...JSON.parse(readFileSync(join(DIR, 'orphan.json'), 'utf8')).items)
}

const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'))
console.log(`복원 ${all.length.toLocaleString()}건 (인덱스 ${index.total_items?.toLocaleString()}건)`)

/**
 * address 앞부분이 온비드 원본 시도명이다.
 * 이 값과 sgg로 다시 판정하면 통합 시도명도 올바르게 갈린다.
 */
const changes = new Map()
let fixed = 0
for (const it of all) {
  const rawSido = (it.address || '').split(' ')[0]
  if (!rawSido) continue
  const correct = resolveSido(rawSido, it.sgg || '')
  if (!correct || correct === it.sido) continue

  changes.set(`${it.sido} → ${correct}`, (changes.get(`${it.sido} → ${correct}`) || 0) + 1)
  if (!dry) {
    it.sido = correct
    // region_name도 시도를 포함하므로 함께 고친다("광주 해남군" 같은 조합을 없앤다).
    it.region_name = it.sgg ? `${correct} ${it.sgg}` : correct
  }
  fixed++
}

if (changes.size === 0) {
  console.log('교정할 물건이 없습니다.')
  process.exit(0)
}

console.log('\n교정 내역:')
for (const [k, v] of [...changes].sort((a, b) => b[1] - a[1])) {
  console.log('  ', String(v).padStart(6), k)
}

if (dry) {
  console.log(`\n--dry 모드라 저장하지 않았습니다. (${fixed.toLocaleString()}건 대상)`)
  process.exit(0)
}

// 샤드를 통째로 다시 만든다. 시도가 바뀌면 시도 샤드 구성도 달라지므로
// 부분 갱신으로는 맞출 수 없다.
const shards = buildAuctionShards({
  last_update: index.last_update,
  source: index.source,
  stats: index.stats,
  incremental_watermark: index.incremental_watermark,
  division_watermarks: index.division_watermarks,
  division_cursors: index.division_cursors,
  items: all,
})

for (const s of shards) {
  const path = join(ROOT, 'netlify/functions/data', s.key + '')
  writeJsonAtomic(path, s.value)
}

console.log(`\n${fixed.toLocaleString()}건 교정, 샤드 ${shards.length}개 저장.`)
console.log('운영 반영: npm run blobs:upload -- auctions')
