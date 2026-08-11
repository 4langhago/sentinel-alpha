// 온비드 연동 가능성 점검 스크립트
//
// "실제로 온비드 데이터를 가져올 수 있는가"에 답하는 것이 목적이다.
// 코드를 본격적으로 쓰기 전에 다음 4가지를 순서대로 확인한다:
//
//   1. 온비드 서버에 도달하는가 (HTTPS / HTTP 중 무엇이 되는가)
//   2. 서비스키가 유효한가
//   3. 어떤 서비스에 활용신청이 되어 있는가 (서비스별로 따로 신청해야 함)
//   4. 실제 물건 데이터가 <item>으로 돌아오는가
//
//   npm run onbid:probe
//
// 실패해도 어디까지 됐는지를 남기므로, 활용신청 누락과 키 오류를 구분할 수 있다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeServiceKey } from '../netlify/functions/lib/molit.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

const pick = (xml, ...names) => {
  for (const n of names) {
    const m = xml.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))
    if (m) {
      const v = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
      if (v) return v
    }
  }
  return ''
}

/**
 * data.go.kr 오류 코드를 사람이 조치할 수 있는 문장으로 바꾼다.
 * 코드 30은 "키가 틀림"과 "이 서비스에 활용신청 안 함"을 구분하지 못하므로
 * 그 사실을 명시한다(molit.mjs에도 같은 주의가 적혀 있다).
 */
const explain = (code, msg) => {
  if (/^0*30$/.test(code)) {
    return '등록되지 않은 서비스키 — 키가 틀렸거나, **이 서비스에 활용신청을 하지 않았습니다**. data.go.kr은 둘을 같은 코드로 반환하므로 구분되지 않습니다.'
  }
  if (/^0*31$/.test(code)) return '활용기간 만료 — data.go.kr에서 연장 신청이 필요합니다.'
  if (/^0*22$/.test(code)) return '일일 호출 한도 초과 — 내일 다시 시도하거나 운영계정 전환을 신청하세요.'
  if (/^0*20$/.test(code)) return '서비스 접근 거부 — 활용신청 승인 대기 중일 수 있습니다.'
  if (/LIMITED_NUMBER|요청제한|초과/i.test(msg)) return '호출 한도 초과.'
  return null
}

// 2026-08-11 확인: openapi.onbid.co.kr 은 TCP 연결은 되지만 응답 없이 연결을 끊는다
// (curl exit 52, "Empty reply from server"). 같은 시점에 apis.data.go.kr 은 정상 응답한다.
// 즉 커뮤니티 자료에 남아 있는 구세대 base URL은 현재 살아있지 않을 가능성이 높다.
// 차세대 온비드 API는 data.go.kr 게이트웨이를 통해 제공되므로 그쪽을 우선 시도한다.
// 차세대 API는 data.go.kr 게이트웨이(apis.data.go.kr/{기관코드})로 제공되지만,
// 캠코 기관코드와 서비스 경로는 아직 확인되지 않았다. 활용신청 화면의
// "엔드포인트" 값을 확인한 뒤 ONBID_API_BASE 로 넘겨 시도할 수 있다.
const BASES = [
  ...(process.env.ONBID_API_BASE ? [{ label: 'ONBID_API_BASE', url: process.env.ONBID_API_BASE }] : []),
  { label: 'onbid-https', url: 'https://openapi.onbid.co.kr/openapi/services' },
  { label: 'onbid-http', url: 'http://openapi.onbid.co.kr/openapi/services' },
]

const CHECKS = [
  {
    svc: 'OnbidCodeInfoInquireSvc',
    op: 'getOnbidAddr1Info',
    label: '코드 조회서비스 (시도 주소코드)',
    why: '파라미터가 거의 없어 키·활용신청 상태를 가장 깨끗하게 확인할 수 있다',
  },
  {
    svc: 'ThingInfoInquireSvc',
    op: 'getUnifyUsageCltr',
    label: '물건정보 조회서비스 (통합 용도별 물건목록)',
    why: '1단계 연동의 주력 오퍼레이션',
  },
  {
    svc: 'ThingInfoInquireSvc',
    op: 'getUnifyDeadlineCltrList',
    label: '물건정보 조회서비스 (마감임박)',
    why: '목록이 작아 응답 확인이 빠르다',
  },
]

const serviceKey = readEnvKey('ONBID_API_KEY')

console.log('온비드 연동 점검\n' + '='.repeat(60))

// --- 1. 키 존재 확인 ---
if (!serviceKey) {
  console.log('\n[1/4] 서비스키           ✗ ONBID_API_KEY 없음')
  console.log(
    '\n.env.local 에 추가하세요:\n\n  ONBID_API_KEY=발급받은_일반인증키(Decoding)\n\n' +
      '발급 절차: .omc/research/onbid-integration.md 7장\n'
  )
  process.exitCode = 1
} else {
  const norm = normalizeServiceKey(serviceKey)
  console.log(`\n[1/4] 서비스키           ✓ 설정됨 (${norm.length}자, ...${norm.slice(-6)})`)

  // --- 2. 서버 도달 확인 ---
  let base = null
  console.log('\n[2/4] 서버 도달')
  for (const b of BASES) {
    try {
      const res = await fetch(`${b.url}/OnbidCodeInfoInquireSvc/getOnbidAddr1Info?serviceKey=x&numOfRows=1`, {
        signal: AbortSignal.timeout(15_000),
      })
      console.log(`  ${b.label.padEnd(6)} ✓ 응답 (HTTP ${res.status})`)
      if (!base) base = b
    } catch (e) {
      console.log(`  ${b.label.padEnd(6)} ✗ ${e.message}`)
    }
  }

  if (!base) {
    console.log('\n온비드 서버에서 응답을 받지 못했습니다.')
    console.log(
      '\n2026-08-11 기준 확인된 사실: openapi.onbid.co.kr 은 DNS는 해석되고 TCP 연결도 되지만\n' +
        '응답 없이 연결을 끊습니다(Empty reply). 같은 시점에 apis.data.go.kr 은 정상 응답하므로\n' +
        '이쪽 네트워크 문제가 아니라 **구세대 엔드포인트가 살아있지 않을 가능성**이 높습니다.\n' +
        '\n조치: data.go.kr 활용신청 화면에서 실제 "엔드포인트" 주소를 확인한 뒤\n' +
        '  ONBID_API_BASE=<확인한주소> npm run onbid:probe\n' +
        '로 다시 시도하세요.\n'
    )
    process.exitCode = 1
  } else {
    console.log(`  → ${base.label} 사용`)

    // --- 3~4. 서비스별 활용신청 + 데이터 확인 ---
    console.log('\n[3/4] 서비스별 활용신청 및 응답')
    const results = []

    for (const c of CHECKS) {
      const params = new URLSearchParams({ serviceKey: normalizeServiceKey(serviceKey), numOfRows: '3', pageNo: '1' })
      let xml = ''
      try {
        const res = await fetch(`${base.url}/${c.svc}/${c.op}?${params}`, { signal: AbortSignal.timeout(20_000) })
        xml = await res.text()
      } catch (e) {
        console.log(`\n  ✗ ${c.label}\n     요청 실패: ${e.message}`)
        results.push({ ...c, ok: false })
        continue
      }

      const code = pick(xml, 'returnReasonCode', 'resultCode')
      const msg = pick(xml, 'returnAuthMsg', 'errMsg', 'resultMsg')
      const isError = msg && !/^0*0$/.test(code) && !/NORMAL/i.test(msg)

      if (isError) {
        console.log(`\n  ✗ ${c.label}`)
        console.log(`     ${msg}${code ? ` (code ${code})` : ''}`)
        const hint = explain(code, msg)
        if (hint) console.log(`     → ${hint}`)
        results.push({ ...c, ok: false })
        continue
      }

      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      const total = pick(xml, 'totalCount')
      console.log(`\n  ✓ ${c.label}`)
      console.log(`     item ${items.length}개${total ? ` / 전체 ${Number(total).toLocaleString()}건` : ''}`)
      if (items.length === 0) {
        console.log('     → 인증은 통과했으나 데이터가 비었습니다. 필수 파라미터가 더 필요할 수 있습니다.')
      } else {
        const tags = [...items[0][1].matchAll(/<([A-Za-z0-9_]+)>/g)].map((m) => m[1])
        console.log(`     필드 ${tags.length}개: ${tags.slice(0, 8).join(', ')}${tags.length > 8 ? ' ...' : ''}`)
      }
      results.push({ ...c, ok: true, count: items.length })
    }

    // --- 판정 ---
    console.log('\n[4/4] 판정\n' + '='.repeat(60))
    const usable = results.filter((r) => r.ok && r.count > 0)
    const authOk = results.filter((r) => r.ok)

    if (usable.length > 0) {
      console.log(`\n온비드 데이터를 가져올 수 있습니다. (${usable.length}/${CHECKS.length} 오퍼레이션에서 데이터 확인)`)
      console.log('\n다음 단계:')
      console.log('  npm run onbid:dump    ← 원본 XML을 저장해 필드명·금액 단위를 확정')
    } else if (authOk.length > 0) {
      console.log('\n인증은 통과했지만 물건 데이터를 받지 못했습니다.')
      console.log('필수 파라미터(용도코드·주소코드 등)를 채워야 할 가능성이 높습니다.')
      console.log('  npm run onbid:dump -- --op getOnbidTopCodeInfo   ← 용도코드부터 확인')
    } else {
      console.log('\n아직 가져올 수 없습니다. 위 오류 메시지를 확인하세요.')
      console.log('가장 흔한 원인은 **서비스별 활용신청 누락**입니다(키가 하나여도 서비스마다 따로 신청해야 합니다).')
      process.exitCode = 1
    }
    console.log()
  }
}
