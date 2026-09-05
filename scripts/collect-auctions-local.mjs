// 로컬 공매 물건 수집 스크립트
// 배포하지 않고 ONBID_API_KEY가 실제로 동작하는지 확인하고, 결과를 파일로 저장한다.
//
//   npm run collect:auction -- --max 5 --items 300   (빠른 검증)
//   npm run collect:auction                          (전체 수집)
//   npm run collect:auction -- --division 0007       (압류재산만)
//
// 저장은 항상 기존 데이터와 병합하며, 이번 수집에서 안 보인 물건은 지우지 않고
// CLOSED로 표시한다(온비드는 끝난 물건을 더 이상 주지 않아 지우면 이력을 잃는다).
// 건수가 줄어드는 저장은 --force 로만 가능하다.
//
// 결과는 netlify/functions/data/auction/ 아래에 저장되고,
// 로컬 개발 서버(dev-api)가 이 파일들을 Blobs 대신 사용한다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectAuctions } from '../netlify/functions/lib/collectAuctions.mjs'
import {
  buildAuctionShards,
  readAuctionShard,
  mergeAuctionsWithStored,
} from '../netlify/functions/lib/auctionStorage.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// --- .env 파일에서 키 읽기 (dotenv 의존성 없이 최소 파싱) ---
const readEnvKey = (name) => {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(ROOT, file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && m[1] === name) return m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return process.env[name] || ''
}

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

// process.exit()는 진행 중인 핸들을 강제로 닫아 Windows에서 libuv 어설션을 유발한다.
const fail = (...lines) => {
  lines.forEach((l) => console.error(l))
  process.exitCode = 1
}

const saveShards = async (payload, { force = false } = {}) => {
  const outDir = resolve(ROOT, 'netlify/functions/data')
  const prev = await readAuctionShard('auction/index.json')
  const prevTotal = prev?.total_items || 0
  if (prevTotal > payload.items.length && !force) {
    return fail(
      '',
      `저장을 중단했습니다: 기존 ${prevTotal.toLocaleString()}건 → 이번 ${payload.items.length.toLocaleString()}건으로 줄어듭니다.`,
      '병합이 동작했는지 확인하거나, 의도한 축소라면 --force 를 쓰세요.'
    )
  }
  const shards = buildAuctionShards(payload)
  let bytes = 0
  for (const { key, value } of shards) {
    const path = resolve(outDir, key)
    mkdirSync(dirname(path), { recursive: true })
    const body = JSON.stringify(value)
    writeFileSync(path, body, 'utf8')
    bytes += Buffer.byteLength(body)
  }
  console.log(
    `\n저장 완료: ${resolve(outDir, 'auction')}\n  샤드 ${shards.length}개 · 총 ${(bytes / 1024 / 1024).toFixed(1)}MB`
  )
}

const main = async () => {
  const serviceKey = readEnvKey('ONBID_API_KEY')
  if (!serviceKey) {
    return fail(
      'ONBID_API_KEY가 없습니다. .env.local 에 아래처럼 추가하세요:',
      '',
      '  ONBID_API_KEY=발급받은_일반인증키(Decoding)',
      ''
    )
  }

  const maxCalls = Number(arg('max', 400))
  const maxItems = Number(arg('items', Infinity))
  const divArg = arg('division', '')
  const divisions = divArg ? divArg.split(',').map((s) => s.trim()) : undefined
  // 압류재산만 5만 건이라 한 번에 훑으면 260회 넘게 걸린다. 시도로 쪼개 나눠 돌릴 수 있게 한다.
  const sidoArg = arg('sido', '')
  const sidoFilter = sidoArg ? sidoArg.split(',').map((s) => s.trim()) : undefined

  console.log(
    `공매 수집 시작 — 최대 ${maxCalls}회 호출` +
      (divisions ? `, 재산유형: ${divisions.join(', ')}` : ', 전체 재산유형') +
      (sidoFilter ? `, 지역: ${sidoFilter.join(', ')}` : '') +
      (Number.isFinite(maxItems) ? `, 최대 ${maxItems}건` : '')
  )

  const { payload, seenIds, seenAt, errors, fatal } = await collectAuctions({
    serviceKey,
    divisions,
    sidoFilter,
    maxCalls,
    maxItems,
    onProgress: (m) => console.log('  ', m),
  })

  if (fatal) {
    return fail(
      '',
      '치명적 오류로 중단됐습니다:',
      '   ' + fatal,
      '',
      '확인할 점:',
      '  - data.go.kr 마이페이지에서 "차세대 온비드 부동산 물건목록 조회서비스"(15157207) 활용신청이 승인 상태인지',
      '  - 일반 인증키(Decoding)를 넣었는지 (Encoding 키도 자동 처리하지만 Decoding 권장)',
      '  - 신청 직후라면 반영까지 최대 1시간 정도 걸릴 수 있음'
    )
  }

  const { stats } = payload
  console.log(
    `\n수집 결과: ${stats.collected.toLocaleString()}건 ` +
      `(호출 ${stats.calls}회, 실패 ${stats.errors}건, ${stats.elapsed_sec}초)`
  )
  if (errors.length) {
    console.log('\n실패 예시:')
    errors.slice(0, 5).forEach((e) => console.log('  -', e))
  }

  if (payload.items.length === 0) return fail('', '수집된 물건이 0건입니다. 저장하지 않습니다.')

  // --rebuild: 기존 샤드를 온전히 못 읽어도 병합을 진행한다.
  // orphan 샤드(시군구 코드 없는 물건 보관)가 없던 시절 데이터를 되살리는 용도다 —
  // 그 샤드를 만들려면 저장해야 하는데, 저장은 복원 검사에 막히는 순환을 푼다.
  // 이번 수집이 전량일 때만 안전하다(부분 수집에 쓰면 그만큼 잃는다).
  const rebuild = args.includes('--rebuild')
  if (rebuild) console.log('  --rebuild: 기존 데이터 복원이 부족해도 진행합니다(전량 수집일 때만 쓰세요).')
  const finalPayload = await mergeAuctionsWithStored(
    payload,
    seenIds,
    seenAt,
    (m) => console.log('  ', m),
    { allowIncomplete: rebuild }
  )
  if (!finalPayload) return fail('', '기존 데이터 확인에 실패해 저장을 건너뜁니다.')

  await saveShards(finalPayload, { force: args.includes('--force') })
}

main()
