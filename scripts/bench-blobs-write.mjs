// Blobs 샤드 쓰기 처리량 측정.
//
// 증분 수집이 20초로 줄어도, 샤드 300개 쓰기가 그보다 오래 걸리면
// 함수 시간 제한을 넘는 주범이 바뀔 뿐이다. 실제 속도를 재서 판단한다.
//
//   node scripts/bench-blobs-write.mjs [샘플수] [동시성]
import { getStore } from '@netlify/blobs'
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const cfg = JSON.parse(
  readFileSync(join(homedir(), 'AppData', 'Roaming', 'netlify', 'Config', 'config.json'), 'utf8')
)
const token = Object.values(cfg.users)[0].auth.token
const siteID = JSON.parse(readFileSync('.netlify/state.json', 'utf8')).siteId

const sample = Number(process.argv[2] || 24)
const concurrency = Number(process.argv[3] || 8)

// 실제 샤드와 같은 크기로 재야 의미가 있다. 시군구 샤드를 그대로 쓰되,
// 운영 데이터를 건드리지 않도록 _bench/ 접두어로 쓴다.
const dir = 'netlify/functions/data/auction/sgg'
const files = readdirSync(dir).slice(0, sample)
const payloads = files.map((f) => ({
  key: `_bench/${f}`,
  body: readFileSync(join(dir, f), 'utf8'),
}))
const totalBytes = payloads.reduce((a, p) => a + p.body.length, 0)

const store = getStore({ name: 'auctions', siteID, token })

console.log(
  `샤드 ${payloads.length}개 (평균 ${Math.round(totalBytes / payloads.length / 1024)}KB) ` +
    `동시성 ${concurrency}로 쓰기`
)

const t0 = Date.now()
for (let i = 0; i < payloads.length; i += concurrency) {
  await Promise.all(payloads.slice(i, i + concurrency).map((p) => store.set(p.key, p.body)))
}
const sec = (Date.now() - t0) / 1000

console.log(`\n${sec.toFixed(1)}초 — 샤드당 ${((sec / payloads.length) * 1000).toFixed(0)}ms`)
console.log(`→ 300개 환산 약 ${((sec / payloads.length) * 300).toFixed(0)}초`)

// 벤치용 키는 지운다. 남겨두면 목록 조회와 용량에 섞인다.
let removed = 0
for (let i = 0; i < payloads.length; i += concurrency) {
  await Promise.all(
    payloads.slice(i, i + concurrency).map((p) => store.delete(p.key).then(() => removed++))
  )
}
console.log(`정리 완료 (${removed}개 삭제)`)
