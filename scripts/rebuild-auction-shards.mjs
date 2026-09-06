// 저장된 공매 물건은 그대로 두고 샤드만 다시 만든다.
//
// 왜 필요한가: 샤드 구성 규칙(전국 목록에 무엇을 담을지, 마감임박을 어떻게
// 고를지)은 코드에 있는데, 이미 저장된 샤드는 옛 규칙으로 잘린 결과물이다.
// 규칙을 고쳐도 다음 수집 때까지는 화면이 그대로다. 수집은 온비드 API를
// 수만 건 다시 긁는 일이라, 규칙만 바뀐 경우에는 과하다.
//
//   npm run auction:rebuild-shards          (로컬 샤드 재생성)
//   npm run auction:rebuild-shards -- --dry (무엇이 달라질지만 보기)
//
// 반영: npm run blobs:upload -- auctions
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAuctionShards } from '../netlify/functions/lib/auctionStorage.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'netlify/functions/data/auction')
const dry = process.argv.includes('--dry')

if (!existsSync(join(DIR, 'index.json'))) {
  console.error(`로컬 공매 데이터가 없습니다: ${DIR}`)
  process.exit(1)
}

/**
 * 시군구 샤드 + orphan이 전체 물건이다.
 * (recent/deadline/sido는 이들에서 뽑아낸 부분집합이라 복원에 쓰지 않는다.)
 */
const all = []
for (const f of readdirSync(join(DIR, 'sgg'))) {
  all.push(...JSON.parse(readFileSync(join(DIR, 'sgg', f), 'utf8')).items)
}
if (existsSync(join(DIR, 'orphan.json'))) {
  all.push(...JSON.parse(readFileSync(join(DIR, 'orphan.json'), 'utf8')).items)
}

const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'))
console.log(`복원 ${all.length.toLocaleString()}건 (인덱스 ${index.total_items?.toLocaleString()}건)`)

/** 재산유형 분포를 세어 전국 목록이 한쪽으로 쏠렸는지 눈으로 확인한다. */
const countDiv = (items) => {
  const m = new Map()
  for (const it of items) m.set(it.prpt_div, (m.get(it.prpt_div) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const show = (label, items) => {
  const parts = countDiv(items).map(([k, v]) => `${k} ${v.toLocaleString()}`)
  console.log(`  ${label.padEnd(10)} ${items.length.toLocaleString().padStart(7)}건  ${parts.join(' / ')}`)
}

const beforeRecent = JSON.parse(readFileSync(join(DIR, 'recent.json'), 'utf8')).items
console.log('\n[이전]')
show('recent', beforeRecent)

const shards = buildAuctionShards({
  last_update: index.last_update,
  source: index.source,
  stats: index.stats,
  incremental_watermark: index.incremental_watermark,
  division_watermarks: index.division_watermarks,
  division_cursors: index.division_cursors,
  items: all,
})

const afterRecent = shards.find((s) => s.key.endsWith('recent.json')).value.items
const afterDeadline = shards.find((s) => s.key.endsWith('deadline.json')).value.items
console.log('[이후]')
show('recent', afterRecent)
show('deadline', afterDeadline)

if (dry) {
  console.log(`\n--dry 모드라 저장하지 않았습니다. (샤드 ${shards.length}개 대상)`)
  process.exit(0)
}

for (const s of shards) {
  const path = join(ROOT, 'netlify/functions/data', s.key + '')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(s.value), 'utf8')
}

console.log(`\n샤드 ${shards.length}개 저장.`)
console.log('운영 반영: npm run blobs:upload -- auctions')
