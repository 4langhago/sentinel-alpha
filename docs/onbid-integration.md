# 온비드(OnBid) 공매 물건 연동 사전 조사

작성일: 2026-08-11 · 대상 저장소: `D:\0.Cursor\realestate`

> **표기 규칙**
> - `[확인]` — 공공데이터포털(data.go.kr) 공식 페이지 또는 오픈소스 코드에서 직접 확인한 사실
> - `[추정]` — 기존 data.go.kr API의 일반적 관례에서 유추한 것. 서비스키 발급 후 실제 호출로 검증 필요
> - `[미확인]` — 조사 시점에 확인할 수 없었음. **지어내지 않고 공란으로 둠**
>
> data.go.kr 상세 페이지의 "요청/응답 필드 명세"는 로그인/한국어 로캘 뒤에 있어 이번 조사에서 필드명 단위까지는 열람하지 못했습니다. 아래에서 필드명을 확정적으로 적은 곳은 없습니다.

---

## 1. 온비드 관련 오픈 API 목록

제공기관은 전부 **한국자산관리공사(캠코)**, 담당부서 **디지털시스템부**입니다. `[확인]`

### 1-A. 구(舊) 세대 API — 실사용 사례가 많고 오퍼레이션명이 공개되어 있음

Base URL: `http://openapi.onbid.co.kr/openapi/services` `[확인 — PublicDataReader 소스코드]`

> ⚠️ **2026-08-11 실측 결과 — 이 엔드포인트는 현재 응답하지 않습니다.**
> `openapi.onbid.co.kr`은 DNS 해석(59.186.127.202)과 TCP 연결까지는 되지만, HTTP 요청을 보내면
> 응답 없이 연결을 끊습니다(curl exit 52, "Empty reply from server"). HTTPS/HTTP 모두 동일하며
> User-Agent를 바꿔도 같습니다. 같은 시점 같은 네트워크에서 `apis.data.go.kr`은 정상 응답(HTTP 400)하므로
> **로컬 네트워크 문제가 아니라 구세대 엔드포인트 자체가 살아있지 않은 것으로 보입니다.**
>
> → 아래 "권장 선택"의 1단계(구세대 API 우선) 판단은 **뒤집혔습니다.** 차세대 API(1-B)를 먼저 검토해야 하며,
> 실제 엔드포인트 주소는 data.go.kr 활용신청 화면에서 직접 확인해야 합니다.
> 확인 후 `ONBID_API_BASE=<주소> npm run onbid:probe` 로 재검증하십시오.
> (검증 스크립트: `scripts/probe-onbid.mjs`)
(HTTP. HTTPS 지원 여부 `[미확인]` — Netlify Functions에서 나가는 호출이므로 HTTPS 미지원이면 그대로 http로 호출해야 함)

| data.go.kr ID | 서비스명 | 서비스 경로 | 주요 오퍼레이션 |
|---|---|---|---|
| 15000920 | 온비드 코드 조회서비스 | `OnbidCodeInfoInquireSvc` | `getOnbidTopCodeInfo`(용도 상위), `getOnbidMiddleCodeInfo`, `getOnbidBottomCodeInfo`, `getOnbidAddr1Info`(시도), `getOnbidAddr2Info`(시군구), `getOnbidAddr3Info`(읍면동), `getOnbidDtlAddrInfo` |
| 15000851 | 온비드 캠코공매물건 조회서비스 | `KamcoPblsalThingInquireSvc` | `getKamcoPbctCltrList`(물건목록), `getKamcoPlnmPbctList`(공고목록), `getKamcoPbctSchedule`(일정), `getKamcoPlnmPbctBasicInfoDetail`, `getKamcoPlnmPbctBidDateInfoDetail`, `getKamcoPlnmPbctFileInfoDetail` |
| 15000849 | 온비드 이용기관 공매물건 조회서비스 | `UtlinsttPblsalThingInquireSvc` | `getPublicSaleObject`(물건목록), `getPublicSaleAnnouncement`(공고목록), `getPublicSaleList`(통합공고), `getPublicSaleAnnouncementList`(매각공고), `getPublicLeaseAnnouncementList`(임대공고), `getPublicDeadlineAnnouncementList`(마감임박) |
| 15000907 | 온비드 정부 재산 정보공개 조회서비스 | `GovernmentPropertyInfoSvc` | `getGovernmentProperty`, `getGovernmentPropertyDetail`, `getKamcoProperty`, `getKamcoPropertyDetail` |
| (ID 미확인) | 온비드 물건정보 조회서비스 | `ThingInfoInquireSvc` | `getUnifyUsageCltr`(**통합 용도별 물건목록 — 우리에게 가장 중요**), `getUnifyNewCltrList`, `getUnifyDeadlineCltrList`, `getUnifyPrivateContractCltrList`(수의계약 가능), `getUnifyDegression50PerCltrList`(50% 체감), `getUnifyClickTop20CltrList`, `getUnifyInterestTop20CltrList`, 그리고 상세 계열: `getUnifyUsageCltrBasicInfoDetail`, `...EstimationInfoDetail`(감정평가), `...RentalInfoDetail`(임대차), `...RegisteredInfoDetail`(권리종류), `...BidDateInfoDetail`(공매일정), `...BidHistoryInfoDetail`(입찰이력), `...StockholderInfoDetail`, `...CorporatebodyInfoDetail` |

오퍼레이션 목록 출처: `WooilJeong/PublicDataReader` 의 `PublicDataPortal/kamco.py` `[확인]`
응답 포맷은 XML이며 `response.body.items.item` 구조 `[확인 — 동일 소스의 xmltodict 파싱 코드]`.
공통 파라미터는 `serviceKey`, `numOfRows`, `pageNo` `[확인 — 동일 소스]`. → **우리 MOLIT 클라이언트(`molit.mjs`)의 XML 파서를 거의 그대로 재사용할 수 있습니다.**

### 1-B. 차세대 온비드 API (2026-01-16 등록, 신규) `[확인]`

| data.go.kr ID | 서비스명 | 비고 |
|---|---|---|
| 15157216 | 차세대 온비드 **공고목록** 조회서비스 | 필수 입력: 물건종류코드, 자산구분코드, 개찰일자 시작/종료 `[확인]` |
| 15157218 | 차세대 온비드 공고상세 조회서비스 | |
| (ID 미확인) | 차세대 온비드 **부동산 물건목록** 조회서비스 | 필수 입력: 물건종류코드(prptDivCd 계열), 수의계약가능여부(pvctTrgtYn 계열) `[추정 — 검색 스니펫 기반, 파라미터명 철자 미확인]` |
| 15157247 | 차세대 온비드 **부동산 물건상세** 조회서비스 | 물건관리번호(필수) + 공매조건번호(선택)로 조회. 응답에 **소재지, 면적 상세, 최저입찰가, 감정평가정보 목록, 사진 목록** 포함 `[확인]` |
| 15157232 | 차세대 온비드 동산 물건목록 조회서비스 | 차량 제외 동산. 응답에 물건관리번호, 자산구분, 물건명, 입찰시작/종료일시, 감정가, 최저입찰가 `[확인]` |
| 15157251 | 차세대 온비드 물건상세 입찰정보 조회서비스 | 물건관리번호 + 공매조건번호 둘 다 필수. 입찰방법/입찰제한/회차별 입찰정보 `[확인]` |

**중요한 제약** `[확인]`: 차세대 부동산 물건상세는 *"입찰 진행 중이거나 입찰 예정인 물건만 조회 가능"*. → **낙찰가·유찰 이력 등 "과거 결과" 축적은 API가 주지 않으므로 우리가 스냅샷을 매일 저장해 직접 만들어야 합니다.** 이게 설계상 가장 큰 결정 포인트입니다.

### 권장 선택

**1단계는 구세대 `ThingInfoInquireSvc / getUnifyUsageCltr`(통합 용도별 물건목록)** 로 시작하는 것을 권합니다.
- 캠코 물건 + 이용기관 물건이 통합되어 있어 호출 1계통으로 커버 범위가 넓음
- 용도(아파트/토지/상가 등) + 주소 코드로 필터 가능 → 우리 지역 필터와 결이 맞음
- 오퍼레이션·파라미터 관례가 커뮤니티에 알려져 있어 검증 비용이 낮음

차세대 API는 필드가 더 풍부하지만(사진, 감정평가 목록) 2026-01 등록으로 사례가 거의 없고, **목록 → 상세를 물건관리번호로 N+1 호출**해야 해서 호출 한도를 빠르게 소진합니다. 2단계로 미루는 것을 권합니다.

---

## 2. 서비스키 신청 절차와 제약

| 항목 | 내용 |
|---|---|
| 비용 | 무료 `[확인]` |
| 심의 | **자동승인**(동산 물건목록 페이지에 명시) `[확인]`. 온비드 계열 대부분 자동승인으로 보이나, 서비스별로 다를 수 있으니 신청 화면에서 "자동승인" 표기를 확인할 것 `[추정]` |
| 일일 호출 한도 | **개발계정 1,000회/일**, 운영계정은 활용사례 등록 후 상향 신청 가능 `[확인 — 여러 서비스 페이지 공통]` |
| 인증키 | data.go.kr 공통 인증키. **서비스별로 "활용신청"을 따로 해야 함** (키는 하나여도 신청 안 한 서비스는 거부) |
| 반영 지연 | 신청 직후 최대 1시간 `[추정 — 기존 MOLIT 경험, `collect-local.mjs`에도 동일 안내가 있음]` |
| 포맷 | REST, JSON + XML `[확인]` |
| 문의 | 1566-0025 / opendata_help@nia.or.kr `[확인]` |

**MOLIT 키와 한도를 공유하는가?** → data.go.kr의 일일 한도는 **서비스(활용신청) 단위**로 집계됩니다 `[추정 — 확정 필요]`. 그래도 안전하게, 온비드 수집은 별도 환경변수 `ONBID_API_KEY`로 분리하고 자체 `maxCalls` 예산을 두는 것을 권합니다. 현재 `collect.mjs`의 `DEFAULT_MAX_CALLS=900`은 MOLIT 전용 예산이며 여기에 온비드를 섞으면 둘 다 위험해집니다.

---

## 3. 요청 파라미터 / 응답 필드 스키마

**여기는 솔직히 확인 실패 구간입니다.** data.go.kr 상세 페이지의 필드 명세 표와 첨부된 활용가이드 PDF는 이번 조사에서 열람하지 못했고, 검색으로 나온 필드명(`CLTR_MNMT_NO` 등)은 **교차 확인이 되지 않아 기록하지 않습니다.**

확인된 범위만 정리하면:

**공통 요청 파라미터** `[확인]`
- `serviceKey` (Decoding 키. 우리 `normalizeServiceKey()`가 이미 Encoding/Decoding 양쪽을 처리)
- `numOfRows`, `pageNo`

**`getUnifyUsageCltr` 고유 파라미터** `[미확인]`
용도코드·주소코드·수의계약여부·입찰기간 등을 받을 것으로 보이나 **정확한 이름을 확인하지 못했습니다.** 코드값은 `OnbidCodeInfoInquireSvc`의 `getOnbidTopCodeInfo` / `getOnbidAddr1Info`~`getOnbidAddr3Info`로 먼저 받아와야 합니다 `[확인 — 오퍼레이션 존재]`.

**응답에 존재한다고 확인된 정보 요소** (필드명이 아니라 *의미* 단위) `[확인]`
- 물건관리번호, 공매조건번호 (상세 조회의 키)
- 자산구분, 물건명, 소재지
- 면적 상세
- 감정가, 최저입찰가
- 입찰 시작/종료 일시
- (차세대 부동산 상세) 감정평가정보 목록, 사진 목록

> **선행 작업 필수**: 서비스키를 받은 직후, 어떤 코드도 쓰기 전에 `getUnifyUsageCltr`를 `numOfRows=5`로 한 번 호출해 **원본 XML을 그대로 파일로 덤프**하고, 그 XML을 보고 매핑 테이블을 확정하십시오. 아래 설계안의 `onbid.mjs` 매핑 부분은 그때까지 비워 둡니다.

### 온비드 주소코드 ≠ 법정동코드 `[추정, 높은 확신]`

우리 `regionCodes.mjs`는 국토부 법정동코드 5자리(`LAWD_CD`)를 씁니다. 온비드는 자체 주소코드 체계(`getOnbidAddr1Info`/`Addr2Info`)를 제공하므로 **두 체계가 다를 가능성이 높습니다.** 지역 필터를 우리 기존 시도/시군구와 연결하려면 **온비드 주소코드 ↔ 법정동코드 매핑 테이블**을 한 번 만들어 정적 파일로 커밋해 두는 작업이 필요합니다. 이름 기반 매칭("서울특별시 강남구" → "서울/강남구")으로 대부분 자동 생성 가능하지만, 통합시·자치구 개편 지역은 수동 보정이 필요합니다.

---

## 4. 실거래(MOLIT) 데이터와의 성격 차이 — 별도 타입을 두어야 하는가

### 결론: **`TradeItem`에 끼워넣지 말고 별도 `AuctionItem` 타입 + 별도 샤드 네임스페이스를 두십시오.**

근거:

| 축 | MOLIT 실거래 (`TradeItem`) | 온비드 공매 물건 |
|---|---|---|
| 사건의 성질 | **과거에 체결된 사실** — 불변 | **미래 일정** — 회차마다 최저가가 떨어지고, 유찰/낙찰/취소로 상태가 바뀜 |
| 핵심 금액 | `price` (확정 거래가) 1개 | 감정가 / 최저입찰가 **2개 이상**, 회차별로 변동 |
| 시간 | `deal_date` 1개 | 입찰 **시작~종료 구간** + 개찰일 + 회차 |
| 레코드 수명 | 영구 | 입찰 종료 후 API에서 사라짐 (차세대 상세는 "진행 중/예정만 조회 가능" `[확인]`) |
| 단위 | 단지·전용면적 중심 | 필지/건물/지분/동산 등 이질적 |
| 통계 의미 | 중위 평당가 = 시세 | 최저입찰가 평당가는 시세가 **아님**(감정가 대비 체감률이 핵심 지표) |

`TradeItem`에 옵셔널 필드를 얹는 방식은 다음을 깨뜨립니다:
- `storage.mjs: computeStats()` — 공매 최저가가 `price`에 섞이면 **중위가·평당가 통계가 즉시 오염**됩니다. 지분거래를 굳이 걸러내는 현재 설계 의도와 정면으로 충돌합니다.
- `api.mjs: loadScope()` / `sorters` — `deal_date` 정렬 전제가 공매에는 맞지 않습니다(마감임박순이 자연스러운 정렬).
- `id` 안정성 — 공매는 `물건관리번호 + 공매조건번호`가 자연키이고, `TradeItem`의 `단지-면적-날짜-가격` 합성키와 성격이 다릅니다.

### 대신 이렇게 연결

공통 축은 **지역(시군구 코드)과 좌표/주소** 하나면 충분합니다. 화면에서는 "이 지역의 실거래 중위가 vs 이 공매 물건의 최저입찰가" 같은 **교차 비교**로 가치를 내고, 데이터 레이어는 분리해 두는 것이 안전합니다. 이미 있는 `index.json`의 시군구 통계가 그 비교의 기준값이 되어 줍니다.

### 스냅샷 이력 (중요)

물건이 API에서 사라지면 우리도 잃습니다. 그러므로 수집 시 **기존 저장분과 병합하고, 사라진 물건은 지우지 말고 `status: 'CLOSED'`로 표시**하십시오. `storage.mjs`의 `mergeItems()`가 이미 "id 기준 병합, 신규가 덮어쓰기" 패턴을 제공하므로 같은 방식을 쓰되, **소멸 감지**만 추가하면 됩니다. 이 스냅샷이 쌓이면 나중에 "감정가 대비 낙찰률" 같은, API가 주지 않는 지표를 우리만 갖게 됩니다.

---

## 5. 갱신 주기 권장값

| 대상 | 주기 | 근거 |
|---|---|---|
| 공매 물건 목록 (전체) | **하루 2회 (KST 08:00 / 18:00)** | 입찰 시작·종료가 일 단위로 움직임. 실거래(1일 1회)보다 잦아야 하지만, 온비드 공고는 보통 주 단위로 등록되므로 시간 단위까지는 과함 `[추정]` |
| 마감임박 물건 (`getUnifyDeadlineCltrList`) | **3~6시간** | 목록이 작고 사용자 체감 가치가 가장 큼 |
| 물건 상세 (감정평가·권리관계) | **최초 1회 + 주 1회 재확인** | 거의 불변. N+1 호출이라 한도 소모가 크므로 아낄 것 |
| 코드/주소 테이블 | **분기 1회 또는 수동** | 사실상 고정. 정적 파일로 커밋 |

Netlify Scheduled Function은 UTC 기준입니다(`refresh-trades.mjs`가 `'0 0 * * *'`로 KST 09:00). 하루 2회면 `'0 23,9 * * *'` (KST 08:00 / 18:00).

**호출 예산**: 개발계정 1,000회/일 기준, 하루 2회 실행이면 회당 **400회 이하**로 상한을 두십시오(여유 200회는 수동 트리거·재시도용). MOLIT과 키를 나눈다면 각각 별도 예산입니다.

---

## 6. 연동 설계안

기존 파이프라인(`collect → buildShards → Blobs → api.mjs`)의 구조를 그대로 복제하되 **네임스페이스만 분리**합니다. 검증된 구조를 재발명하지 않는 것이 요점입니다.

### 새로 만들 파일

| 경로 | 역할 |
|---|---|
| `netlify/functions/lib/onbid.mjs` | 온비드 API 클라이언트. `molit.mjs`와 같은 역할·같은 스타일. `pick()`/`toInt()`/`toFloat()`/`readError()`/`normalizeServiceKey()`는 `molit.mjs`에서 **공용 모듈로 추출해 공유**(아래 참조). `SERVICES` 상수에 `ThingInfoInquireSvc` 오퍼레이션 정의, `fetchAuctions()`가 XML → `AuctionItem` 정규화. **필드 매핑은 실제 XML 덤프를 본 뒤 채울 것.** |
| `netlify/functions/lib/xmlPick.mjs` | `molit.mjs`에서 추출한 XML 파싱 유틸 (`pick`, `toInt`, `toFloat`, `readError`, `normalizeServiceKey`). 두 클라이언트가 공유. |
| `netlify/functions/lib/onbidCodes.mjs` | 온비드 용도코드 + 주소코드 상수, **온비드 주소코드 ↔ 법정동코드 5자리 매핑 테이블**. `regionCodes.mjs`와 짝을 이룸. |
| `netlify/functions/lib/collectAuctions.mjs` | `collect.mjs`의 공매 버전. 호출 계획(`buildAuctionPlan`) + 수집 + 중복 제거 + 통계. **소멸 물건 `CLOSED` 처리 포함.** |
| `netlify/functions/lib/auctionStorage.mjs` | `storage.mjs`의 공매 버전. 샤드 키를 `auction/` 접두어로 분리: `auction/index.json`, `auction/sgg/{코드}.json`, `auction/deadline.json`(마감임박), `auction/recent.json`. **Blobs store는 `'trades'`와 별도로 `'auctions'`를 쓸 것** — 스토어를 공유하면 한쪽 수집 실패가 다른 쪽 인덱스를 오염시킬 수 있습니다. |
| `netlify/functions/refresh-auctions.mjs` | 스케줄 함수. `refresh-trades.mjs`를 그대로 본뜬 구조(치명적 오류 시 기존 데이터 보존, index.json 마지막 저장). `config.schedule = '0 23,9 * * *'`. |
| `scripts/collect-auctions-local.mjs` | `collect-local.mjs`의 공매 버전. 키 검증 + 로컬 샤드 저장. |
| `scripts/dump-onbid-sample.mjs` | **가장 먼저 만들 것.** 원본 XML을 그대로 파일로 떨어뜨려 필드명을 확정하기 위한 일회성 스크립트. |
| `src/types/auction.ts` | `AuctionItem`, `AuctionSearchParams`, `AuctionSearchResult`, `AuctionStatus` 타입. `trade.ts`의 `formatPrice`/`toPyeong`은 재사용(import). |
| `src/services/auctionApi.ts` | `tradeApi.ts`와 같은 형태의 클라이언트. |
| `src/pages/AuctionPage.tsx` | 공매 물건 목록/필터 화면. |

### `AuctionItem` 타입 초안

필드명은 API 스키마 확인 후 확정하되, **의미 단위는 아래로 고정 가능**합니다:

- `id` — `물건관리번호-공매조건번호` (자연키)
- `cltr_mng_no`, `pbct_cdtn_no` — 원본 키 (상세 조회용)
- `name` — 물건명
- `sgg_code`, `sido`, `sgg`, `region_name`, `address` — 우리 지역 체계로 정규화 (기존 `TradeItem`과 동일 규약 → 지역 조인 가능)
- `use_type` — 온비드 용도 (아파트/토지/상가/...)
- `property_type` — `PropertyType`으로 매핑 시도, 불가하면 `'ETC'`
- `area`, `land_area` — ㎡
- `appraisal_price` — 감정가 (원)
- `min_bid_price` — 최저입찰가 (원)
- `discount_rate` — `min_bid_price / appraisal_price` (파생, 우리가 계산)
- `bid_round` — 회차
- `bid_start_at`, `bid_end_at`, `open_at` — ISO 문자열
- `status` — `'SCHEDULED' | 'OPEN' | 'CLOSED'` (우리가 판정)
- `private_contract` — 수의계약 가능 여부
- `first_seen_at`, `last_seen_at` — **우리 스냅샷 메타.** 소멸 감지와 이력 축적의 근거
- `detail_url` — 온비드 원문 링크 (신뢰성 확보용, 필수)

금액 단위 주의: MOLIT은 만원 단위라 `× 10_000`을 하고 있습니다. 온비드는 **원 단위일 가능성이 높으나 `[미확인]`** — 샘플 XML에서 반드시 확인하십시오. 여기서 틀리면 화면 전체가 10,000배 틀립니다.

### 기존 파일 수정 지점

| 파일 | 수정 내용 |
|---|---|
| `netlify/functions/lib/molit.mjs` | `pick`/`toInt`/`toFloat`/`readError`/`normalizeServiceKey`를 `xmlPick.mjs`로 이동하고 import. **동작 변경 없음(순수 추출)**, 기존 수집 결과가 바뀌지 않는지 `npm run collect -- --sido 서울 --months 1 --max 5`로 확인 |
| `netlify/functions/api.mjs` | 라우트 추가: `/auctions`, `/auctions/:id`, `/auctions/stats`. 기존 `/trades` 계열 로직은 손대지 않음. `auctionStorage.mjs`의 `readAuctionIndex()`를 별도로 읽어 공매 데이터가 없어도 실거래는 정상 동작하게 할 것 |
| `netlify/functions/refresh-now.mjs` | `?target=auctions` 파라미터로 공매 수동 트리거도 지원 (토큰 보호 로직 재사용) |
| `src/components/Navigation.tsx` | "공매" 메뉴 추가 |
| `src/App.tsx` (라우터) | `/auction` 라우트 추가 |
| `package.json` | `"collect:auction": "node scripts/collect-auctions-local.mjs"` 추가 |
| `netlify.toml` | 신규 스케줄 함수 등록이 필요하면 반영 (현재 `config` export 방식이면 불필요) |
| `.env.example` / 문서 | `ONBID_API_KEY` 추가 |

### 단계별 진행 순서 (권장)

1. **키 발급 → `dump-onbid-sample.mjs`로 원본 XML 확보 → 필드 매핑 확정** ← 여기까지 끝나기 전에는 다른 코드를 쓰지 말 것
2. `xmlPick.mjs` 추출 (기존 동작 무회귀 확인)
3. `onbid.mjs` + `onbidCodes.mjs`
4. `collectAuctions.mjs` + `auctionStorage.mjs` + 로컬 스크립트로 소량 수집 검증
5. `api.mjs` 라우트 + `auctionApi.ts` + `AuctionPage.tsx`
6. `refresh-auctions.mjs` 스케줄 등록 (마지막. 자동 실행이 한도를 태우기 전에 나머지를 검증)

---

## 7. 사용자가 직접 해야 할 일 (체크리스트)

- [ ] **1.** data.go.kr 로그인 (기존 MOLIT 신청 계정 그대로 사용 가능)
- [ ] **2.** 다음 서비스에 **활용신청** (각각 따로 신청해야 함):
  - [ ] 온비드 **물건정보 조회서비스** (`ThingInfoInquireSvc`) — **최우선. 이것 하나면 1단계 연동 가능**
  - [ ] 온비드 **코드 조회서비스** — https://www.data.go.kr/data/15000920/openapi.do (용도/주소 코드용)
  - [ ] (선택) 온비드 캠코공매물건 — https://www.data.go.kr/data/15000851/openapi.do
  - [ ] (선택) 온비드 이용기관 공매물건 — https://www.data.go.kr/data/15000849/openapi.do
- [ ] **3.** 신청 화면에서 **"자동승인"인지 확인**. 자동승인이면 즉시, 아니면 승인까지 대기 (온비드 계열은 자동승인으로 보임)
- [ ] **4.** 마이페이지 → 개발계정 → **일반 인증키(Decoding)** 복사
- [ ] **5.** `.env.local`에 추가:
      ```
      ONBID_API_KEY=발급받은_일반인증키(Decoding)
      ```
- [ ] **6.** Netlify 사이트 설정 → Environment variables 에도 `ONBID_API_KEY` 동일하게 추가 (배포용)
- [ ] **7.** 신청 직후라면 **최대 1시간 대기** 후 첫 호출 시도
- [ ] **8.** 활용가이드 문서(각 API 페이지의 "참고문서" 다운로드) 를 받아 저장소에 보관 — **필드 명세가 거기 있습니다.** 받으신 뒤 알려주시면 매핑을 확정하겠습니다
- [ ] **9.** (나중에) 서비스가 안정되면 **운영계정 전환 신청** — 활용사례 등록 후 한도 상향

---

## 8. 리스크 / 불확실한 부분

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | **응답 필드 스키마 미확인** | 매핑 코드를 지금 쓰면 전부 재작업 | 샘플 XML 덤프를 선행 작업으로 못 박음. 이 리포트에서 필드명을 지어내지 않은 이유 |
| R2 | **금액 단위(원 vs 만원) 미확인** | 화면 금액이 10,000배 틀림 | 샘플에서 확인. 감정가가 "억" 자릿수인지 육안 검증 |
| R3 | **온비드 주소코드 ≠ 법정동코드** | 지역 필터가 실거래와 안 맞음 | 매핑 테이블을 정적 파일로 생성·커밋. 이름 기반 자동 매칭 + 수동 보정 |
| R4 | **API가 진행 중/예정 물건만 제공** `[확인]` | 과거 낙찰 이력을 못 만듦 | 스냅샷 병합 + `CLOSED` 표시로 우리가 이력을 축적. 초기에는 데이터가 얇음을 UI에 명시 |
| R5 | **일일 1,000회 한도** | MOLIT과 합치면 조기 소진 | 키·예산·스토어를 완전히 분리. `maxCalls` 상한 별도 |
| R6 | **base URL이 HTTP** `[확인]` | Netlify Functions에서 평문 통신 | 서버 사이드 호출이라 브라우저 mixed-content는 아님. HTTPS 지원 여부를 첫 호출 때 함께 시도해 볼 것 |
| R7 | **차세대 API가 구세대를 대체할 가능성** | 구세대 폐지 시 재작업 | 2026-01 등록된 차세대와 구세대가 현재 병존. `onbid.mjs`에서 오퍼레이션 정의를 상수 테이블로 두어 교체 비용을 낮춤 |
| R8 | **`getUnifyUsageCltr`가 속한 서비스의 data.go.kr ID 미확인** | 활용신청 대상을 못 찾음 | data.go.kr에서 "온비드"로 검색 후 "물건정보 조회서비스" 항목을 찾으면 됨. 기관 목록: https://www.data.go.kr/tcs/dss/selectDataSetList.do?org=한국자산관리공사 |
| R9 | **법적/이용 조건** | | 온비드 서비스들은 "이용허락범위 제한 없음" `[확인]`. 다만 실제 매물 정보를 표시할 때 **온비드 원문 링크와 출처를 병기**하고, 우리 데이터가 스냅샷임을 명시할 것 (입찰 마감 정보가 틀리면 사용자 피해가 실질적) |

### 특히 강조할 점

우리 서비스는 지금 "확정된 과거 가격"만 다룹니다. 공매는 **사용자가 그 정보를 보고 돈을 걸 수 있는 미래 일정**이라 데이터 신선도의 책임 수준이 다릅니다. 최소한 다음 두 가지는 UI 요구사항으로 못 박기를 권합니다.
1. 모든 공매 물건 카드에 **`last_seen_at`(우리가 마지막으로 확인한 시각)** 표시
2. 모든 물건에 **온비드 원문 링크**를 걸어, 최종 확인은 원문에서 하도록 유도

---

## 참고 링크

- [한국자산관리공사_온비드 코드 조회서비스](https://www.data.go.kr/data/15000920/openapi.do)
- [한국자산관리공사_온비드 캠코공매물건 조회서비스](https://www.data.go.kr/data/15000851/openapi.do)
- [한국자산관리공사_온비드 이용기관 공매물건 조회서비스](https://www.data.go.kr/data/15000849/openapi.do)
- [한국자산관리공사_온비드 정부 재산 정보공개 조회서비스](https://www.data.go.kr/data/15000907/openapi.do)
- [차세대 온비드 공고목록 조회서비스](https://www.data.go.kr/data/15157216/openapi.do)
- [차세대 온비드 공고상세 조회서비스](https://www.data.go.kr/data/15157218/openapi.do)
- [차세대 온비드 부동산 물건상세 조회서비스](https://www.data.go.kr/data/15157247/openapi.do)
- [차세대 온비드 동산 물건목록 조회서비스](https://www.data.go.kr/data/15157232/openapi.do)
- [차세대 온비드 물건상세 입찰정보 조회서비스](https://www.data.go.kr/data/15157251/openapi.do)
- [한국자산관리공사 데이터셋 전체 목록](https://www.data.go.kr/tcs/dss/selectDataSetList.do?org=%ED%95%9C%EA%B5%AD%EC%9E%90%EC%82%B0%EA%B4%80%EB%A6%AC%EA%B3%B5%EC%82%AC)
- [PublicDataReader — 캠코 공매물건 조회하기 (오퍼레이션 목록 출처)](https://wooiljeong.github.io/python/pdr-kamco/)
- [PublicDataReader kamco.py 소스 (base URL·파라미터 출처)](https://github.com/WooilJeong/PublicDataReader/blob/main/PublicDataReader/PublicDataPortal/kamco.py)
- [온비드 소개 (캠코)](https://www.kamco.or.kr/portal/contents.do?mId=0405000000)
