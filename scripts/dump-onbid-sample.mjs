// 온비드(OnBid) 오픈API 원본 응답 덤프 스크립트
//
// 목적: 필드 매핑 코드를 쓰기 **전에** 실제 응답 XML을 눈으로 확인하는 것.
// 공공데이터포털 상세 페이지의 필드 명세를 열람하지 못해, 응답 태그명·금액 단위·
// 날짜 포맷을 추측으로 코딩하면 전부 재작업이 된다. 그래서 이 스크립트가 1단계다.
//
//   npm run onbid:dump                          (기본 오퍼레이션 몇 개를 소량 조회)
//   npm run onbid:dump -- --op getUnifyUsageCltr --rows 5
//   npm run onbid:dump -- --svc ThingInfoInquireSvc --op getUnifyNewCltrList
//   npm run onbid:dump -- --param DPSL_MTD_CD=0001 --param CTGR_HIRK_ID=10000
//
// 키는 .env.local 또는 .env 의 ONBID_API_KEY 에서 읽는다.
// 결과는 .omc/research/onbid-samples/ 아래에 원본 그대로 저장된다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeServiceKey } from '../netlify/functions/lib/molit.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(ROOT, '.omc/research/onbid-samples')

// 구세대 온비드 API. HTTPS 지원 여부가 확인되지 않아 https를 먼저 시도하고
// 실패하면 http로 재시도한다(리스크 R6).
const BASES = ['https://openapi.onbid.co.kr/openapi/services', 'http://openapi.onbid.co.kr/openapi/services']

// 조사 리포트(.omc/research/onbid-integration.md)에서 확인된 오퍼레이션.
// 파라미터는 미확인이므로 여기서는 공통 파라미터만 보내고, 필요하면 --param으로 덧붙인다.
const DEFAULT_TARGETS = [
  { svc: 'ThingInfoInquireSvc', op: 'getUnifyUsageCltr', note: '통합 용도별 물건목록 — 1단계 연동의 주력' },
  { svc: 'ThingInfoInquireSvc', op: 'getUnifyNewCltrList', note: '신규 물건' },
  { svc: 'ThingInfoInquireSvc', op: 'getUnifyDeadlineCltrList', note: '마감임박 물건' },
  { svc: 'OnbidCodeInfoInquireSvc', op: 'getOnbidTopCodeInfo', note: '용도 상위코드' },
  { svc: 'OnbidCodeInfoInquireSvc', op: 'getOnbidAddr1Info', note: '시도 주소코드' },
]

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
/** --param KEY=VALUE 를 여러 번 받을 수 있다. */
const extraParams = () => {
  const out = {}
  args.forEach((a, i) => {
    if (a !== '--param') return
    const kv = args[i + 1] || ''
    const eq = kv.indexOf('=')
    if (eq > 0) out[kv.slice(0, eq)] = kv.slice(eq + 1)
  })
  return out
}

const rows = arg('rows', '5')
const onlyOp = arg('op', '')
const onlySvc = arg('svc', '')

const targets = onlyOp
  ? [{ svc: onlySvc || 'ThingInfoInquireSvc', op: onlyOp, note: '사용자 지정' }]
  : DEFAULT_TARGETS.filter((t) => !onlySvc || t.svc === onlySvc)

/** 응답이 에러 XML인지 판별한다. molit.mjs의 readError와 같은 판정 규칙. */
const readError = (xml) => {
  const pick = (...names) => {
    for (const n of names) {
      const m = xml.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))
      if (m) {
        const v = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
        if (v) return v
      }
    }
    return ''
  }
  const code = pick('returnReasonCode', 'resultCode')
  const msg = pick('returnAuthMsg', 'errMsg', 'resultMsg')
  if (!msg) return null
  if (/^0*0$/.test(code) || /NORMAL/i.test(msg)) return null
  return `${msg}${code ? ` (code ${code})` : ''}`
}

/** 응답에서 <item> 하나를 뽑아 태그명을 나열한다. 매핑 테이블을 만들 때 쓴다. */
const summarizeFields = (xml) => {
  const first = xml.match(/<item>([\s\S]*?)<\/item>/)
  if (!first) return null
  const fields = []
  for (const m of first[1].matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g)) {
    fields.push({ tag: m[1], sample: m[2].replace(/<!\[CDATA\[|\]\]>/g, '').trim().slice(0, 60) })
  }
  return fields
}

const serviceKey = readEnvKey('ONBID_API_KEY')
if (!serviceKey) {
  console.error(
    '\nONBID_API_KEY가 없습니다.\n' +
      '.env.local 에 다음을 추가하세요:\n\n' +
      '  ONBID_API_KEY=발급받은_일반인증키(Decoding)\n\n' +
      '키 발급 절차는 .omc/research/onbid-integration.md 의 7장을 참고하세요.\n'
  )
  process.exitCode = 1
} else {
  mkdirSync(OUT_DIR, { recursive: true })

  const summary = []

  for (const { svc, op, note } of targets) {
    const params = new URLSearchParams({
      serviceKey: normalizeServiceKey(serviceKey),
      numOfRows: rows,
      pageNo: '1',
      ...extraParams(),
    })

    let xml = ''
    let usedBase = ''
    let netErr = null

    for (const base of BASES) {
      try {
        const res = await fetch(`${base}/${svc}/${op}?${params}`, { signal: AbortSignal.timeout(20_000) })
        xml = await res.text()
        usedBase = base
        if (!res.ok && !xml) netErr = `HTTP ${res.status}`
        break
      } catch (e) {
        netErr = e.message
      }
    }

    if (!xml) {
      console.error(`✗ ${op} — 요청 실패: ${netErr}`)
      summary.push({ svc, op, note, ok: false, error: netErr })
      continue
    }

    const file = resolve(OUT_DIR, `${svc}.${op}.xml`)
    writeFileSync(file, xml, 'utf8')

    const err = readError(xml)
    if (err) {
      console.error(`✗ ${op} — ${err}`)
      console.error(`  (원본 저장: ${file})`)
      summary.push({ svc, op, note, ok: false, error: err, base: usedBase })
      continue
    }

    const fields = summarizeFields(xml)
    console.log(`\n✓ ${op}  ${note}`)
    console.log(`  base: ${usedBase}`)
    console.log(`  저장: ${file}`)
    if (!fields) {
      console.log('  <item>이 없습니다 — 파라미터가 더 필요할 수 있습니다. 원본 XML을 직접 확인하세요.')
    } else {
      console.log(`  필드 ${fields.length}개:`)
      for (const f of fields) console.log(`    ${f.tag.padEnd(28)} ${f.sample}`)
    }
    summary.push({ svc, op, note, ok: true, base: usedBase, fieldCount: fields?.length ?? 0, fields })
  }

  const summaryFile = resolve(OUT_DIR, '_summary.json')
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8')
  console.log(`\n요약: ${summaryFile}`)
  console.log(
    '\n다음 단계 — 위 필드 목록을 보고 확인할 것:\n' +
      '  1. 금액 필드가 원 단위인가 만원 단위인가 (감정가가 억 자릿수로 보이는지)\n' +
      '  2. 날짜 포맷 (YYYYMMDD / YYYY-MM-DD / 시각 포함 여부)\n' +
      '  3. 물건관리번호·공매조건번호에 해당하는 태그명\n' +
      '  4. 주소 필드가 시도/시군구로 쪼개져 오는지, 한 줄 문자열인지\n'
  )
}
