// 증분 갱신 한 사이클의 실제 소요 시간을 구간별로 잰다.
//
// Netlify 함수에는 실행 시간 제한이 있어, "수집이 빨라졌다"만으로는 부족하다.
// 병합(기존 샤드 전부 읽기)과 저장이 더 오래 걸릴 수 있어 구간별로 재야
// 어디를 고쳐야 하는지 알 수 있다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectAuctions } from '../netlify/functions/lib/collectAuctions.mjs'
import { readAllAuctions, mergeAuctions, buildAuctionShards } from '../netlify/functions/lib/auctionStorage.mjs'
import { toYmd } from '../netlify/functions/lib/onbid.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const readEnvKey = (name) => {
  for (const file of ['.env.local', '.env']) {
    const p = resolve(ROOT, file)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && m[1] === name) return m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return process.env[name] || ''
}

const serviceKey = readEnvKey('ONBID_API_KEY')
if (!serviceKey) {
  console.error('ONBID_API_KEY 없음')
  process.exit(1)
}

const days = Number(process.argv[2] || 3)
const modifiedFrom = toYmd(new Date(Date.now() - days * 86400000))
console.log(`증분 갱신 벤치마크 — 최근 ${days}일 수정분 (mdfcnYmdStart=${modifiedFrom})\n${'='.repeat(60)}`)

const t = {}
const mark = (k, fn) => {
  const s = Date.now()
  return Promise.resolve(fn()).then((v) => {
    t[k] = ((Date.now() - s) / 1000).toFixed(1)
    return v
  })
}

const { payload, seenIds, seenAt } = await mark('1. 수집(API)', () =>
  collectAuctions({ serviceKey, modifiedFrom, onProgress: (m) => console.log('   ', m) })
)
console.log(`   → ${payload.items.length.toLocaleString()}건, 호출 ${payload.stats.calls}회`)

const existing = await mark('2. 기존 읽기', () => readAllAuctions())
console.log(`   → 기존 ${existing.length.toLocaleString()}건`)

const merged = await mark('3. 병합', () => mergeAuctions(existing, payload.items, seenIds, seenAt))
console.log(`   → ${merged.items.length.toLocaleString()}건 (마감 ${merged.closed}건)`)

const shards = await mark('4. 샤드 생성', () =>
  buildAuctionShards({ ...payload, items: merged.items })
)
console.log(`   → 샤드 ${shards.length}개`)

console.log('\n구간별 소요(초):')
let total = 0
for (const [k, v] of Object.entries(t)) {
  console.log('  ', k.padEnd(16), String(v).padStart(6))
  total += Number(v)
}
console.log('  ', '합계(저장 제외)'.padEnd(16), String(total.toFixed(1)).padStart(6))
console.log(
  '\n참고: 여기에 Blobs 저장(샤드 수백 개 쓰기)이 더해진다.\n' +
    'Netlify 함수 시간 제한 안에 들어가는지가 판단 기준이다.\n'
)
