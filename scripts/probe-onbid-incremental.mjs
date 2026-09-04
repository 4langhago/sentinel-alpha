// mdfcnYmdStart/End(최종수정일 범위) 파라미터가 실제로 동작하는지 검증한다.
//
// 온비드 API는 모르는 파라미터를 조용히 무시하므로, "에러가 안 났다"는 근거가
// 되지 못한다. totalCount가 실제로 줄어드는지로만 판별할 수 있다.
//
//   npm run onbid:probe-inc
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

import { normalizeServiceKey } from '../netlify/functions/lib/xmlPick.mjs'

const BASE = 'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2'
const serviceKey = readEnvKey('ONBID_API_KEY')

const ymd = (d) => {
  const t = new Date(Date.now() - d * 86400000)
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`
}

/** totalCount만 뽑아온다. numOfRows=1로 최소 호출. */
const totalFor = async (extra) => {
  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(serviceKey),
    numOfRows: '1',
    pageNo: '1',
    prptDivCd: '0007', // 압류재산
    pvctTrgtYn: 'N',
    ...extra,
  })
  const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(30_000) })
  const text = await res.text()
  const m = text.match(/<totalCount>(\d+)<\/totalCount>/)
  if (!m) {
    const err = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>|<errMsg>([^<]*)<\/errMsg>/)
    return { total: null, err: err ? err[1] || err[2] : text.slice(0, 120) }
  }
  return { total: Number(m[1]) }
}

if (!serviceKey) {
  console.error('ONBID_API_KEY가 없습니다.')
  process.exitCode = 1
} else {
  console.log('증분 수집 파라미터 검증 (압류재산 기준)\n' + '='.repeat(58))

  const base = await totalFor({})
  console.log(`\n기준(파라미터 없음)          totalCount = ${base.total?.toLocaleString() ?? base.err}`)

  if (base.total === null) {
    console.error('\n기준 호출부터 실패했습니다. 키·활용신청을 확인하세요.')
    process.exitCode = 1
  } else {
    const cases = [
      { label: '최근 1일 수정분', p: { mdfcnYmdStart: ymd(1), mdfcnYmdEnd: ymd(0) } },
      { label: '최근 3일 수정분', p: { mdfcnYmdStart: ymd(3), mdfcnYmdEnd: ymd(0) } },
      { label: '최근 7일 수정분', p: { mdfcnYmdStart: ymd(7), mdfcnYmdEnd: ymd(0) } },
      { label: '최근 30일 수정분', p: { mdfcnYmdStart: ymd(30), mdfcnYmdEnd: ymd(0) } },
      // 대조군: 존재하지 않는 파라미터. 이게 base와 같으면 "무시된다"는 뜻이고,
      // 위 케이스가 base와 다르면 mdfcnYmd는 실제로 먹는다는 뜻이다.
      { label: '[대조군] 가짜 파라미터', p: { nonsenseParamXyz: '20260101' } },
    ]

    for (const c of cases) {
      const r = await totalFor(c.p)
      const changed = r.total !== null && r.total !== base.total
      console.log(
        `${c.label.padEnd(24)} totalCount = ${(r.total?.toLocaleString() ?? r.err).toString().padStart(10)}` +
          (r.total !== null ? `  ${changed ? '← 필터 적용됨' : '(기준과 동일 = 무시됨)'}` : '')
      )
    }

    console.log(
      '\n판정 기준: 대조군은 기준과 같아야 하고(무시됨), mdfcnYmd 케이스는 달라야 한다(적용됨).\n' +
        '둘 다 기준과 같으면 이 API는 최종수정일 필터를 지원하지 않는 것이므로,\n' +
        '증분 수집은 다른 방식(예: 시도별 분할)으로 설계해야 한다.\n'
    )
  }
}
