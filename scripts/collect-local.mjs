// 로컬 실거래 수집 스크립트
// 배포하지 않고 서비스키가 실제로 동작하는지 확인하고, 결과를 파일로 저장한다.
//
//   npm run collect -- --sido 서울 --months 1 --max 20   (빠른 검증)
//   npm run collect                                       (전체 수집)
//
// 키는 .env.local 또는 .env 의 MOLIT_API_KEY 에서 읽는다.
// 결과는 netlify/functions/data/latest.json 에 저장되고,
// 로컬 개발 서버(dev-api)가 이 파일을 Blobs 대신 사용한다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectTrades } from '../netlify/functions/lib/collect.mjs'

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

const main = async () => {
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

  console.log(
    `수집 시작 — 최근 ${months}개월, 최대 ${maxCalls}회 호출` +
      (sidoFilter ? `, 지역: ${sidoFilter.join(', ')}` : ', 전국')
  )

  const { payload, errors, fatal } = await collectTrades({
    serviceKey,
    months,
    maxCalls,
    sidoFilter,
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

  const outDir = resolve(ROOT, 'netlify/functions/data')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'latest.json')
  writeFileSync(outPath, JSON.stringify(payload), 'utf8')

  console.log(`\n저장 완료: ${outPath}`)
  console.log('\n샘플 3건:')
  for (const it of payload.items.slice(0, 3)) {
    const eok = (it.price / 100_000_000).toFixed(2)
    const perPyeong = Math.round(it.price_per_pyeong / 10000).toLocaleString()
    console.log(
      `  ${it.deal_date}  ${it.region_name} ${it.name}  ` +
        `${it.area}㎡ ${it.floor}층  ${eok}억  (평당 ${perPyeong}만원)`
    )
  }
  console.log('\n이제 npm run dev:api 와 npm run dev 를 띄우면 실데이터로 화면이 뜹니다.')
}

await main()
