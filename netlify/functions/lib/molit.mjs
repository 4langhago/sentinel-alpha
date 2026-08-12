// 국토교통부 실거래가 오픈API 클라이언트
// 서비스: 아파트 매매 / 아파트 전월세 / 오피스텔 매매 (기관코드 1613000)
//
// 응답이 XML이고, 서비스 개편으로 태그명이 구버전(한글)과 신버전(영문)이 섞여 있어
// 양쪽을 모두 허용하는 파서를 사용한다.

import { pick, toInt, toFloat, readError, normalizeServiceKey } from './xmlPick.mjs'

// 온비드 클라이언트 등에서도 molit.mjs 경유로 쓰고 있어 재수출한다.
export { normalizeServiceKey }

const BASE = 'https://apis.data.go.kr/1613000'

export const SERVICES = {
  APT_TRADE: {
    id: 'APT_TRADE',
    label: '아파트 매매',
    // 상세자료(Dev) 버전. 일반 버전보다 필드가 많고, 특히 계약 해제 여부(cdealType)를
    // 제공해 해제된 거래를 시세 통계에서 걸러낼 수 있다.
    // 상세자료는 아파트 매매에만 존재하고 전월세·오피스텔에는 없다.
    path: 'RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
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
  // 상가·사무실. 단지명이 없고 면적이 건물면적/대지면적으로 나뉜다.
  NRG_TRADE: {
    id: 'NRG_TRADE',
    label: '상업업무용 매매',
    path: 'RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade',
    dealType: 'TRADE',
    propertyType: 'COMMERCIAL',
  },
  // 토지. 단지·건물 개념이 없고 거래면적(㎡)과 지목만 있다.
  LAND_TRADE: {
    id: 'LAND_TRADE',
    label: '토지 매매',
    path: 'RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade',
    dealType: 'TRADE',
    propertyType: 'LAND',
  },
}

/** 기본 수집 대상 */
export const DEFAULT_SERVICE_IDS = ['APT_TRADE', 'APT_RENT', 'OFFI_TRADE', 'NRG_TRADE', 'LAND_TRADE']

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
    serviceKey: normalizeServiceKey(serviceKey),
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
  let cancelled = 0
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1]

    // 상세자료의 해제여부: 'O'면 계약이 해제된 거래.
    // 실제로 성사되지 않은 가격이라 시세 통계에 넣으면 왜곡되므로 제외한다.
    const cdealType = pick(b, 'cdealType', '해제여부')
    if (cdealType.toUpperCase() === 'O') {
      cancelled++
      continue
    }

    // 신버전(영문) / 구버전(한글) 태그를 모두 시도
    const umd = pick(b, 'umdNm', 'legalDong', '법정동')
    const jibun = pick(b, 'jibun', '지번')
    const sggCd = pick(b, 'sggCd', '지역코드') || lawdCd

    // 상가·토지는 단지명이 없다. 같은 건물/필지를 묶을 수 있도록 "법정동 지번"을 이름으로 쓴다.
    const rawName = pick(b, 'aptNm', 'offiNm', 'aptName', '아파트', '단지')
    const name = rawName || [umd, jibun].filter(Boolean).join(' ') || '(이름 없음)'

    // 용도: 상가는 건물주용도(제2종근린생활시설 등), 토지는 지목
    const useType = pick(b, 'buildingUse', 'landUse', '건물주용도', '지목', '용도지역')
    // 지분 거래는 일부 지분만 사고판 것이라 면적당 단가가 크게 왜곡된다.
    const shareType = pick(b, 'shareDealingType', '거래구분')
    const isShareDeal = /지분/.test(shareType)

    const year = pick(b, 'dealYear', '년')
    const month = pick(b, 'dealMonth', '월')
    const day = pick(b, 'dealDay', '일')
    if (!year || !month || !day) continue

    // 면적 기준이 종목마다 다르다.
    //   아파트·오피스텔 → 전용면적 / 상가 → 건물면적 / 토지 → 거래면적
    const area = toFloat(
      pick(b, 'excluUseAr', 'excluUseArea', '전용면적', 'buildingAr', '건물면적', 'dealArea', '거래면적')
    )
    const landArea = toFloat(pick(b, 'plottageAr', '대지면적'))
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

    // 상세자료에만 있는 부가 정보 (없으면 빈 값)
    const dealingGbn = pick(b, 'dealingGbn', '거래유형') // 중개거래 / 직거래
    const roadNm = pick(b, 'roadNm', '도로명')

    items.push({
      // 같은 단지·면적·날짜·가격이면 동일 거래로 간주하는 안정적 ID
      id: `${sggCd}-${name}-${area}-${dealDate}-${dealAmount || deposit}-${floor}`,
      name: name || '(단지명 없음)',
      sgg_code: sggCd,
      umd,
      jibun,
      address,
      road_name: roadNm,
      /** '중개거래' | '직거래' | '' (아파트 매매 상세자료에만 존재) */
      dealing_type: dealingGbn,
      /** 상가는 건물주용도, 토지는 지목 */
      use_type: useType,
      /** 토지 지분 등 일부 지분만 거래된 건 (면적당 단가가 왜곡되므로 통계에서 제외) */
      share_deal: isShareDeal,
      /** 상가의 대지면적 (㎡). 없으면 0 */
      land_area: landArea,
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

  // 해제 건수는 수집 로그에서 확인할 수 있도록 배열에 비열거 속성으로 붙인다.
  Object.defineProperty(items, 'cancelledCount', { value: cancelled, enumerable: false })
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
