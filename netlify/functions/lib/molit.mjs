// 국토교통부 실거래가 오픈API 클라이언트
// 서비스: 아파트 매매 / 아파트 전월세 / 오피스텔 매매 (기관코드 1613000)
//
// 응답이 XML이고, 서비스 개편으로 태그명이 구버전(한글)과 신버전(영문)이 섞여 있어
// 양쪽을 모두 허용하는 파서를 사용한다.

const BASE = 'https://apis.data.go.kr/1613000'

export const SERVICES = {
  APT_TRADE: {
    id: 'APT_TRADE',
    label: '아파트 매매',
    path: 'RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
    dealType: 'TRADE',
    propertyType: 'APARTMENT',
  },
  APT_RENT: {
    id: 'APT_RENT',
    label: '아파트 전월세',
    path: 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
    dealType: 'RENT',
    propertyType: 'APARTMENT',
  },
  OFFI_TRADE: {
    id: 'OFFI_TRADE',
    label: '오피스텔 매매',
    path: 'RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade',
    dealType: 'TRADE',
    propertyType: 'OFFICETEL',
  },
}

// XML 한 <item> 안에서 여러 후보 태그명 중 처음 발견되는 값을 꺼낸다.
const pick = (body, ...names) => {
  for (const n of names) {
    const m = body.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))
    if (m) {
      const v = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
      if (v) return v
    }
  }
  return ''
}

const toInt = (v) => {
  const n = parseInt(String(v).replace(/[,\s]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}
const toFloat = (v) => {
  const n = parseFloat(String(v).replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** API가 에러 XML을 돌려줬는지 확인하고, 그렇다면 사람이 읽을 메시지를 만든다. */
const readError = (xml) => {
  const code = pick(xml, 'returnReasonCode', 'resultCode')
  const msg = pick(xml, 'returnAuthMsg', 'errMsg', 'resultMsg')
  if (!msg) return null
  // 정상 응답도 resultCode 00 / "NORMAL SERVICE."를 담고 있으므로 제외
  if (/^0*0$/.test(code) || /NORMAL/i.test(msg)) return null
  return `${msg}${code ? ` (code ${code})` : ''}`
}

/**
 * 시군구 + 계약월 단위로 실거래 내역을 조회한다.
 * @param {object} opts
 * @param {string} opts.serviceKey  data.go.kr 서비스키 (디코딩된 원본)
 * @param {object} opts.service     SERVICES 중 하나
 * @param {string} opts.lawdCd      법정동코드 5자리
 * @param {string} opts.dealYmd     'YYYYMM'
 * @param {number} [opts.numOfRows]
 */
export async function fetchTrades({ serviceKey, service, lawdCd, dealYmd, numOfRows = 1000 }) {
  const params = new URLSearchParams({
    serviceKey,
    LAWD_CD: lawdCd,
    DEAL_YMD: dealYmd,
    pageNo: '1',
    numOfRows: String(numOfRows),
  })
  const url = `${BASE}/${service.path}?${params}`

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  const xml = await res.text()

  // 상태코드가 4xx여도 본문에 실제 원인(등록되지 않은 서비스키 등)이 담겨 있으므로
  // 본문을 먼저 읽어 구체적인 메시지를 만든다.
  const err = readError(xml)
  if (err) throw new Error(err)
  if (!res.ok) throw new Error(`data.go.kr HTTP ${res.status}`)

  const items = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1]

    // 신버전(영문) / 구버전(한글) 태그를 모두 시도
    const name = pick(b, 'aptNm', 'offiNm', 'aptName', '아파트', '단지')
    const umd = pick(b, 'umdNm', 'legalDong', '법정동')
    const jibun = pick(b, 'jibun', '지번')
    const sggCd = pick(b, 'sggCd', '지역코드') || lawdCd

    const year = pick(b, 'dealYear', '년')
    const month = pick(b, 'dealMonth', '월')
    const day = pick(b, 'dealDay', '일')
    if (!year || !month || !day) continue

    const area = toFloat(pick(b, 'excluUseAr', 'excluUseArea', '전용면적'))
    const floor = toInt(pick(b, 'floor', '층'))
    const buildYear = toInt(pick(b, 'buildYear', '건축년도'))

    // 매매는 거래금액(만원), 전월세는 보증금/월세(만원)
    const dealAmount = toInt(pick(b, 'dealAmount', '거래금액'))
    const deposit = toInt(pick(b, 'deposit', '보증금액', '보증금'))
    const monthlyRent = toInt(pick(b, 'monthlyRent', '월세금액', '월세'))

    const dealDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    // 만원 단위 → 원 단위로 통일
    const priceWon = dealAmount * 10_000
    const depositWon = deposit * 10_000
    const monthlyRentWon = monthlyRent * 10_000

    const address = [umd, jibun].filter(Boolean).join(' ')

    items.push({
      // 같은 단지·면적·날짜·가격이면 동일 거래로 간주하는 안정적 ID
      id: `${sggCd}-${name}-${area}-${dealDate}-${dealAmount || deposit}-${floor}`,
      name: name || '(단지명 없음)',
      sgg_code: sggCd,
      umd,
      jibun,
      address,
      property_type: service.propertyType,
      deal_type: service.dealType,
      // 전월세 중 월세가 0이면 전세
      rent_type: service.dealType === 'RENT' ? (monthlyRent > 0 ? 'MONTHLY' : 'JEONSE') : null,
      area,
      floor,
      build_year: buildYear,
      deal_date: dealDate,
      price: service.dealType === 'TRADE' ? priceWon : depositWon,
      monthly_rent: monthlyRentWon,
      // 3.3㎡(평)당 가격 — 시세 비교의 기준 지표
      price_per_pyeong:
        area > 0 ? Math.round(((service.dealType === 'TRADE' ? priceWon : depositWon) / area) * 3.305785) : 0,
    })
  }

  return items
}

/** 최근 N개월치 'YYYYMM' 목록 (당월 포함, 최신순) */
export function recentMonths(count = 3, from = new Date()) {
  const out = []
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}
