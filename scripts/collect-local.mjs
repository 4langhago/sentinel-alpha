// 로컬 실거래 수집 스크립트
// 배포하지 않고 서비스키가 실제로 동작하는지 확인하고, 결과를 파일로 저장한다.
//
//   npm run collect -- --sido 서울 --months 1 --max 20   (빠른 검증)
//   npm run collect                                       (전체 수집)
//   npm run collect -- --rebuild                          (API 호출 없이 샤드 전수 조사·재생성)
//
// 저장은 항상 기존 데이터와 병합한다. 전체 교체는 --replace, 건수가 줄어드는
// 저장은 --force 로만 가능하다(데이터 유실 방지).
//
// 키는 .env.local 또는 .env 의 MOLIT_API_KEY 에서 읽는다.
// 결과는 netlify/functions/data/ 아래에 조회용 샤드로 저장되고,
// 로컬 개발 서버(dev-api)가 이 파일들을 Blobs 대신 사용한다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectTrades } from '../netlify/functions/lib/collect.mjs'
import {
  buildShards,
  readAllItems,
  mergeItems,
  readShard,
  reconcileFromShards,
} from '../netlify/functions/lib/storage.mjs'
import { ALL_SGG } from '../netlify/functions/lib/regionCodes.mjs'

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

// --- 인자 파싱 ---
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

// 종료 코드만 지정하고 이벤트 루프가 자연스럽게 끝나도록 둔다.
// process.exit()는 진행 중인 핸들을 강제로 닫아 Windows에서 libuv 어설션을 유발한다.
const fail = (...lines) => {
  lines.forEach((l) => console.error(l))
  process.exitCode = 1
}

/**
 * 조회용 샤드로 쪼개 저장한다. 한 파일에 몰아두면 요청마다 전체를 파싱하게 된다.
 *
 * 저장 직전에 "이번 저장이 기존보다 데이터를 줄이는가"를 반드시 확인한다.
 * 실제로 index.json이 기존 208,583건 중 117,189건만 담은 채 덮여 쓰여, 부산·대구·
 * 인천·울산이 통째로 서비스에서 사라진 사고가 있었다. 샤드 파일은 남아 있었는데도
 * readAllItems()가 index.json에 등록된 시군구만 순회하는 구조라 스스로 복구되지
 * 않았다. 줄어드는 저장은 기본적으로 막고, 의도한 축소라면 --force로만 통과시킨다.
 */
const saveShards = async (payload, { force = false, isRebuildCall = false } = {}) => {
  const outDir = resolve(ROOT, 'netlify/functions/data')
  const prev = await readShard('index.json')
  const prevTotal = prev?.total_items || 0
  if (prevTotal > payload.items.length && !force) {
    const lines = [
      '',
      `저장을 중단했습니다: 기존 ${prevTotal.toLocaleString()}건 → 이번 ${payload.items.length.toLocaleString()}건으로 줄어듭니다.`,
      '데이터 유실 가능성이 있어 막았습니다.',
    ]
    // --rebuild 스스로가 막힌 경우엔 "--rebuild를 실행하라"고 안내하면 안 된다 —
    // 이미 그 경로에 있다. 이때는 --force만 남긴다.
    if (!isRebuildCall) {
      lines.push('  - 일부 지역만 다시 모은 거라면 병합이 동작하는지 확인하세요.')
      lines.push('  - 샤드가 index보다 많이 남아 있다면: npm run collect -- --rebuild (샤드 전수 조사로 복구)')
    }
    lines.push('  - 의도한 축소라면: --force')
    return fail(...lines)
  }
  const shards = buildShards(payload)
  let bytes = 0
  for (const { key, value } of shards) {
    const path = resolve(outDir, key)
    mkdirSync(dirname(path), { recursive: true })
    const body = JSON.stringify(value)
    writeFileSync(path, body, 'utf8')
    bytes += Buffer.byteLength(body)
  }
  console.log(
    `\n저장 완료: ${outDir}\n  샤드 ${shards.length}개 · 총 ${(bytes / 1024 / 1024).toFixed(1)}MB`
  )
}

/**
 * API를 호출하지 않고 이미 저장된 거래로 샤드만 다시 만든다.
 * 통계 계산 방식이 바뀌었을 때 하루 호출 한도를 쓰지 않고 반영하기 위한 경로다.
 *
 * index.json이 아니라 시군구 샤드 파일을 전수 조사(reconcileFromShards)한다.
 * index가 불완전하게 덮여 쓰인 적이 있으면 readAllItems()는 그 불완전한 목록만
 * 복원해 유실이 영구화된다 — 실제로 그렇게 91,394건(부산·대구·인천·울산 전체와
 * 경기 대부분)이 사라져 있었다. 파일이 남아 있는 한 여기서 되찾는다.
 */
const rebuildOnly = async (force) => {
  const { items: existing, found, missing } = await reconcileFromShards(ALL_SGG)
  if (existing.length === 0) {
    return fail('저장된 거래가 없습니다. 먼저 수집을 실행하세요.')
  }
  const idxPrev = await readShard('index.json')
  const registered = Object.keys(idxPrev?.sgg || {}).length
  console.log(
    `샤드 전수 조사: 시군구 ${found.length}개 · ${existing.length.toLocaleString()}건 ` +
      `(index에 등록돼 있던 것은 ${registered}개 · ${(idxPrev?.total_items || 0).toLocaleString()}건, ` +
      `미보유 시군구 ${missing.length}개)`
  )
  console.log(`저장된 ${existing.length.toLocaleString()}건으로 샤드를 다시 만듭니다 (API 호출 없음)`)
  const idx = idxPrev || {}
  return saveShards(
    {
      items: existing,
      last_update: idx.last_update || new Date().toISOString(),
      source: idx.source || 'molit',
      months: idx.months || [],
      stats: { ...(idx.stats || {}), rebuilt_at: new Date().toISOString() },
    },
    // rebuild는 "샤드 파일이 진실"이라는 별도 경로라 축소 가드와 별개로
    // --force를 받아들인다. 안 받으면, index가 샤드보다 커진 반대 방향의
    // 유실(예: 저장 도중 중단)에서 --rebuild --force조차 통하지 않는
    // 사각지대가 생긴다 — 그 경우 가드 메시지가 안내하는 유일한 복구
    // 수단이 스스로 막혀버린다.
    { force, isRebuildCall: true }
  )
}

const main = async () => {
  if (args.includes('--rebuild')) return rebuildOnly(args.includes('--force'))

  const serviceKey = readEnvKey('MOLIT_API_KEY')
  if (!serviceKey) {
    return fail(
      'MOLIT_API_KEY가 없습니다. .env.local 에 아래처럼 추가하세요:',
      '',
      '  MOLIT_API_KEY=발급받은_일반인증키(Decoding)',
      ''
    )
  }

  const months = Number(arg('months', 3))
  const maxCalls = Number(arg('max', 700))
  const sidoArg = arg('sido', '')
  const sidoFilter = sidoArg ? sidoArg.split(',').map((s) => s.trim()) : undefined
  // --services APT_TRADE,NRG_TRADE 처럼 종목을 좁힐 수 있다 (호출 한도 절약용)
  const servicesArg = arg('services', '')
  const serviceIds = servicesArg ? servicesArg.split(',').map((s) => s.trim().toUpperCase()) : undefined

  console.log(
    `수집 시작 — 최근 ${months}개월, 최대 ${maxCalls}회 호출` +
      (sidoFilter ? `, 지역: ${sidoFilter.join(', ')}` : ', 전국') +
      (serviceIds ? `, 종목: ${serviceIds.join(', ')}` : '')
  )

  const { payload, errors, fatal } = await collectTrades({
    serviceKey,
    months,
    maxCalls,
    sidoFilter,
    serviceIds,
    onProgress: (m) => console.log('  ', m),
  })

  if (fatal) {
    return fail(
      '',
      '치명적 오류로 중단됐습니다:',
      '   ' + fatal,
      '',
      '확인할 점:',
      '  - data.go.kr 마이페이지에서 해당 API 활용신청이 승인 상태인지',
      '  - 일반 인증키(Decoding)를 넣었는지 (Encoding 키도 자동 처리하지만 Decoding 권장)',
      '  - 신청 직후라면 반영까지 최대 1시간 정도 걸릴 수 있음'
    )
  }

  const { stats } = payload
  console.log(
    `\n수집 결과: ${stats.deduped}건 ` +
      `(호출 ${stats.calls}/${stats.planned}회, 실패 ${stats.errors}건, ${stats.elapsed_sec}초)`
  )

  if (errors.length) {
    console.log('\n실패 예시:')
    errors.slice(0, 5).forEach((e) => console.log('  -', e))
  }

  if (payload.items.length === 0) {
    return fail('', '수집된 거래가 0건입니다. 저장하지 않습니다.')
  }

  // 기존 데이터를 덮어쓰지 않도록 항상 병합한다. (--replace 로만 전체 교체)
  //
  // 예전에는 --sido/--service 로 범위를 좁혔을 때만 병합했는데, 전국 수집은
  // 호출 예산(900회) 때문에 계획(2,175회)을 한 바퀴도 못 돈다. 그래서 필터 없는
  // 실행이 오히려 "이번에 못 돈 지역을 통째로 날리는" 경로가 됐다 — 실제 유실
  // 사고의 원인이다. 범위와 무관하게 병합이 기본이어야 한다.
  const replace = args.includes('--replace')
  let finalPayload = payload
  if (!replace) {
    const existing = await readAllItems()
    if (existing.length > 0) {
      const merged = mergeItems(existing, payload.items)
      console.log(
        `\n기존 ${existing.length.toLocaleString()}건과 병합 → ` +
          `${merged.length.toLocaleString()}건 (신규 ${(merged.length - existing.length).toLocaleString()}건)`
      )
      finalPayload = { ...payload, items: merged }
    }
  }

  await saveShards(finalPayload, { force: args.includes('--force') })

  if (stats.skipped_services?.length) {
    console.log(
      `\n건너뛴 서비스: ${stats.skipped_services.join(', ')} ` +
        '(data.go.kr에서 해당 API 활용신청이 필요합니다)'
    )
  }
  if (stats.cancelled > 0) {
    console.log(`계약 해제로 제외한 거래: ${stats.cancelled}건`)
  }

  // 매매/전월세 구성을 함께 보여준다. 구분 없이 금액만 찍으면
  // 월세 보증금이 매매가처럼 보여 오해를 부른다.
  const count = (fn) => finalPayload.items.filter(fn).length
  console.log(
    `\n구성: 매매 ${count((i) => i.deal_type === 'TRADE')}건 · ` +
      `전세 ${count((i) => i.rent_type === 'JEONSE')}건 · ` +
      `월세 ${count((i) => i.rent_type === 'MONTHLY')}건`
  )

  const describe = (it) => {
    const eok = (it.price / 100_000_000).toFixed(2)
    const perPyeong = Math.round(it.price_per_pyeong / 10000).toLocaleString()
    const kind =
      it.deal_type === 'TRADE'
        ? `매매 ${eok}억 (평당 ${perPyeong}만원)`
        : it.rent_type === 'JEONSE'
        ? `전세 보증금 ${eok}억`
        : `월세 보증금 ${eok}억 / 월 ${Math.round(it.monthly_rent / 10000)}만원`
    return (
      `  ${it.deal_date}  ${it.region_name} ${it.name}  ` +
      `${it.area}㎡ ${it.floor}층  ${kind}`
    )
  }

  const trades = finalPayload.items.filter((i) => i.deal_type === 'TRADE')
  if (trades.length) {
    console.log('\n매매 샘플 3건:')
    trades.slice(0, 3).forEach((it) => console.log(describe(it)))
  }
  const rents = finalPayload.items.filter((i) => i.deal_type === 'RENT')
  if (rents.length) {
    console.log('\n전월세 샘플 3건:')
    rents.slice(0, 3).forEach((it) => console.log(describe(it)))
  }
  console.log('\n이제 npm run dev:api 와 npm run dev 를 띄우면 실데이터로 화면이 뜹니다.')
}

await main()
