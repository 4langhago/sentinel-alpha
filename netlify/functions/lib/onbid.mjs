// 온비드(차세대) 부동산 물건목록 오픈API 클라이언트
//
// 서비스: 한국자산관리공사_차세대 온비드 부동산 물건목록 조회서비스 (data.go.kr 15157207)
// 엔드포인트: https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2
//
// molit.mjs와 같은 역할·같은 스타일이며, XML 파싱 유틸은 xmlPick.mjs를 공유한다.
// (data.go.kr 게이트웨이라 에러를 HTTP 상태가 아니라 본문 XML로 돌려주는 규약이 같다.)
//
// 아래 필드명·단위·포맷은 전부 2026-08-31에 실제 응답을 덤프해 확인한 것이다:
//   - 금액(apslEvlAmt, lowstBidPrcIndctCont)은 **원 단위**  (예: 75762000 = 7,576만원)
//   - 일시(cltrBidBgngDt, cltrBidEndDt)는 yyyyMMddHHmm    (예: 202612141400)
//   - 면적(landSqms, bldSqms)은 ㎡
//   - ltnoPnu(PNU 19자리) 앞 5자리가 그대로 시군구 법정동코드다
import { pick, toInt, toFloat, readError, normalizeServiceKey } from './xmlPick.mjs'
import {
  resolveSido,
  SIDO_TO_ONBID,
  sggCodeFromPnu,
  toAuctionStatus,
  toPropertyType,
} from './onbidCodes.mjs'

const BASE = 'https://apis.data.go.kr/B010003'
const LIST_PATH = 'OnbidRlstListSrvc2/getRlstCltrList2'

/** 이 서비스가 요구하는 필수 파라미터. 하나라도 빠지면 빈 응답이 온다(에러도 아니다). */
const REQUIRED = { pvctTrgtYn: 'N' }

/**
 * Date → yyyyMMdd (KST 기준).
 * 온비드는 한국 서비스라 날짜 경계도 KST로 봐야 한다. UTC로 계산하면
 * 한국 시각 오전 9시 이전에 하루 전 날짜를 보내게 된다.
 */
export const toYmd = (d) => {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10).replace(/-/g, '')
}

export { normalizeServiceKey }

/**
 * 온비드가 주는 yyyyMMddHHmm(또는 yyyyMMdd)을 ISO 문자열로.
 * 온비드 일시는 KST 기준이라 타임존을 명시해 붙인다 — 안 붙이면 브라우저가
 * 로컬 타임존으로 읽어 입찰 마감 시각이 최대 9시간 틀리게 표시된다.
 */
function toIso(raw) {
  const s = String(raw || '').replace(/\D/g, '')
  if (s.length < 8) return ''
  const d = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (s.length < 12) return `${d}T00:00:00+09:00`
  return `${d}T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`
}

/** 온비드 물건 상세 페이지 딥링크. 2026 리뉴얼 후 URL이며 실제 200 응답을 확인했다. */
export function detailUrl(it) {
  const q = new URLSearchParams({
    // 0001 = 부동산 화면 그룹
    cltrScrnGrpCd: '0001',
    cltrPrptDivCd: it.prpt_div_code || '',
    onbidCltrno: String(it.onbid_cltr_no || ''),
    onbidPbancNo: String(it.onbid_pbanc_no || ''),
    pbctNo: String(it.pbct_no || ''),
    pbctCdtnNo: String(it.pbct_cdtn_no || ''),
  })
  return `https://www.onbid.co.kr/op/cltrpbancinf/cltrdtl/CltrDtlController/mvmnCltrDtl.do?${q}`
}

/**
 * <item> 하나를 우리 AuctionItem으로 정규화한다.
 * @param {string} body item 태그 안쪽 XML
 * @param {string} seenAt 이 스냅샷을 찍은 시각(ISO). 소멸 감지와 신선도 표시의 근거다.
 */
function normalizeItem(body, seenAt) {
  const g = (name) => pick(body, name)

  const cltrMngNo = g('cltrMngNo')
  const pbctCdtnNo = g('pbctCdtnNo')
  if (!cltrMngNo) return null

  // 지역: PNU가 있으면 그쪽이 정확하다(앞 5자리 = 시군구 법정동코드).
  // 건물만 있는 물건은 PNU가 비어 이름 매칭으로 시도까지만 알아낸다.
  const sggCode = sggCodeFromPnu(g('ltnoPnu') || g('rdnmPnu'))
  const sidoRaw = g('lctnSdnm')
  const sgg = g('lctnSggnm')
  // 통합 시도명(전남광주통합특별시)은 시군구까지 봐야 광주/전남을 가를 수 있다.
  const sido = resolveSido(sidoRaw, sgg)
  const umd = g('lctnEmdNm')

  const appraisal = toInt(g('apslEvlAmt'))
  // 최저입찰가는 "비공개"처럼 숫자가 아닌 문자열이 올 수 있다(필드명이 …IndctCont인 이유).
  // toInt는 그런 값을 0으로 만들어 버려 "0원 물건"으로 보이므로, 숫자인지 먼저 가린다.
  const lowestRaw = g('lowstBidPrcIndctCont')
  const hasLowest = /^[0-9,\s]+$/.test(lowestRaw) && toInt(lowestRaw) > 0
  const minBid = hasLowest ? toInt(lowestRaw) : 0

  const mcls = g('cltrUsgMclsCtgrNm')
  const scls = g('cltrUsgSclsCtgrNm')

  const item = {
    // 자연키: 물건관리번호 + 공매조건번호. 회차가 바뀌면 공매조건번호가 바뀌므로
    // 회차별 스냅샷이 서로 덮어쓰지 않고 나란히 쌓인다.
    id: `${cltrMngNo}-${pbctCdtnNo}`,
    cltr_mng_no: cltrMngNo,
    pbct_cdtn_no: pbctCdtnNo,
    onbid_cltr_no: g('onbidCltrno'),
    onbid_pbanc_no: g('onbidPbancNo'),
    pbct_no: g('pbctNo'),
    /** 회차 (같은 물건이 유찰되며 올라간다) */
    bid_round: toInt(g('pbctNsq')),

    name: g('onbidCltrNm'),
    sgg_code: sggCode,
    sido,
    sgg,
    umd,
    region_name: [sido, sgg].filter(Boolean).join(' '),
    address: [sidoRaw, sgg, umd].filter(Boolean).join(' '),

    prpt_div_code: g('prptDivCd'),
    /** 압류재산 / 국유재산 … */
    prpt_div: g('prptDivNm'),
    /** 매각 / 임대 */
    disposal: g('dspsMthodNm'),
    use_mcls_code: g('cltrUsgMclsCtgrId'),
    use_mcls: mcls,
    use_scls: scls,
    property_type: toPropertyType(mcls, scls),

    /** ㎡. 토지 물건은 land_area만, 건물 물건은 area만 채워지는 경우가 많다. */
    land_area: toFloat(g('landSqms')),
    area: toFloat(g('bldSqms')),

    /** 감정평가금액 (원) */
    appraisal_price: appraisal,
    /** 최저입찰가 (원). 비공개면 0이고 min_bid_undisclosed가 true다. */
    min_bid_price: minBid,
    min_bid_undisclosed: !hasLowest,
    /**
     * 감정가 대비 체감률(%). 경공매에서 가장 중요한 단일 지표라 파생값으로 미리 계산한다.
     * 감정가가 0이거나 최저가가 비공개면 null — 0%로 채우면 "공짜 물건"처럼 보인다.
     */
    discount_rate:
      appraisal > 0 && minBid > 0 ? Math.round((minBid / appraisal) * 1000) / 10 : null,
    /** 유찰 횟수. 높을수록 싸지지만 그만큼 문제가 있을 수 있다는 신호다. */
    fail_count: toInt(g('usbdNft')),
    /** 수의계약 가능 여부 */
    private_contract: g('pvctTrgtYn') === 'Y',

    bid_start_at: toIso(g('cltrBidBgngDt')),
    bid_end_at: toIso(g('cltrBidEndDt')),

    bid_status_code: g('pbctStatCd'),
    bid_status: g('pbctStatNm'),
    status: toAuctionStatus(g('pbctStatCd')),

    org_name: g('orgNm'),
    request_org: g('rqstOrgNm'),

    /**
     * 우리 스냅샷 메타. 온비드 API는 입찰이 끝난 물건을 더 이상 주지 않으므로
     * (진행 중·예정만 조회 가능), 이 두 값이 이력 축적과 신선도 고지의 근거다.
     */
    first_seen_at: seenAt,
    last_seen_at: seenAt,
  }

  item.detail_url = detailUrl(item)
  return item
}

/**
 * 물건목록 한 페이지를 가져온다.
 *
 * @returns {Promise<{items: object[], total: number}>}
 * @throws data.go.kr가 에러 XML을 돌려주면 그 메시지로 던진다(호출자가 치명/일시를 판단).
 */
export async function fetchAuctionPage({
  serviceKey,
  prptDivCd,
  sido = '',
  useMclsCode = '',
  pageNo = 1,
  numOfRows = 100,
  seenAt = new Date().toISOString(),
  /**
   * 최종수정일 하한(yyyyMMdd). 주면 그 이후에 바뀐 물건만 받는다 — 증분 수집용.
   *
   * 실측(2026-09-04, 압류재산): 전체 54,849건 중 최근 1일 수정분은 137건뿐이다.
   * 전량은 140여 회 호출·25분이 걸려 Netlify 함수 시간 제한을 넘지만, 증분이면
   * 호출 한두 번으로 끝난다. 스케줄 갱신이 실제로 완주하려면 이 파라미터가 필수다.
   */
  modifiedFrom = '',
  // 500건 응답이 1.3MB라 느린 회선에서는 30초를 넘길 수 있다. 넉넉히 잡는다.
  timeoutMs = 90_000,
}) {
  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(serviceKey),
    numOfRows: String(numOfRows),
    pageNo: String(pageNo),
    prptDivCd,
    ...REQUIRED,
  })
  // 시도는 온비드 정식 명칭으로만 걸린다(약칭을 보내면 0건이 온다).
  if (sido && SIDO_TO_ONBID[sido]) params.set('lctnSdnm', SIDO_TO_ONBID[sido])
  if (useMclsCode) params.set('cltrUsgMclsCtgrId', useMclsCode)
  if (modifiedFrom) {
    // 상한은 넉넉히 오늘로 둔다. 하한만 걸면 서버가 열린 구간으로 해석하지 않을 수
    // 있어(실측에서 둘을 함께 보냈다) 짝으로 보낸다.
    params.set('mdfcnYmdStart', modifiedFrom)
    params.set('mdfcnYmdEnd', toYmd(new Date()))
  }

  const res = await fetch(`${BASE}/${LIST_PATH}?${params}`, {
    signal: AbortSignal.timeout(timeoutMs),
  })
  const xml = await res.text()

  const err = readError(xml)
  if (err) throw new Error(err)

  const items = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = normalizeItem(m[1], seenAt)
    if (it) items.push(it)
  }
  return { items, total: toInt(pick(xml, 'totalCount')) }
}
