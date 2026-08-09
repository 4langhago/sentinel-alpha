// 일일 경매 데이터 갱신 — Netlify Scheduled Function
// 매일 UTC 23:00(KST 08:00, 대법원 데이터 새벽 갱신 직후)에 실행되어
// Netlify Blobs("auctions" store, key "latest.json")에 결과를 저장한다.
// api.mjs는 이 Blob을 읽어서 서빙하고, Blob이 없거나 오래되면 mock으로 폴백한다.
import { getStore } from '@netlify/blobs';
import { generateItems } from './lib/mockData.mjs';

const COURT_API_KEY = process.env.COURT_API_KEY || '';
const DATA_GOV_URL = 'http://apis.data.go.kr/B550013/courtAuctionInfoService';

const PROPERTY_TYPE_MAP = { APARTMENT: '아파트', HOUSE: '단독주택', LAND: '토지', COMMERCIAL: '상가' };

// 공공데이터포털 실제 API 조회 (서비스키가 있을 때만 시도, api/scraper.py._fetch_real 대응)
async function fetchRealRegion(region) {
  const params = new URLSearchParams({
    serviceKey: COURT_API_KEY,
    pageNo: '1',
    numOfRows: '50',
    cortOfcNm: region,
  });
  const res = await fetch(`${DATA_GOV_URL}/getAuctionList?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`data.go.kr ${res.status}`);
  const xml = await res.text();
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const tag = (name) => (body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) || [, ''])[1].trim();
    const caseNo = tag('사건번호') || tag('caseNo');
    if (!caseNo) continue;
    const minBid = parseInt((tag('최저매각가격') || tag('minBidPrice')).replace(/,/g, ''), 10) || 0;
    const appraisal = parseInt((tag('감정평가액') || tag('appraisalPrice')).replace(/,/g, ''), 10) || 0;
    items.push({
      id: caseNo,
      case_number: caseNo,
      court: tag('법원명') || tag('courtName'),
      address: tag('물건소재지') || tag('objectAddr'),
      property_type: tag('물건종류') || tag('objectKind') || 'OTHER',
      area: parseFloat(tag('면적') || tag('objectArea')) || 0,
      minimum_bid: minBid,
      appraisal_value: appraisal,
      auction_date: tag('매각기일') || tag('auctionDate'),
      description: tag('물건내용') || tag('objectDesc') || '',
      images: [],
      status: 'SCHEDULED',
      rights: [],
      risk_score: 0,
      discount_rate: appraisal > 0 ? Math.round((1 - minBid / appraisal) * 1000) / 10 : 0,
      yield_rate: minBid > 0 ? Math.round(((appraisal - minBid) / minBid) * 1000) / 10 : 0,
      risk_items: [],
    });
  }
  return items;
}

const REGIONS = ['서울', '부산', '대구', '인천', '울산', '광주', '대전', '수원', '의정부', '창원', '청주', '전주', '천안', '순천'];

async function collectItems() {
  if (!COURT_API_KEY) return null; // 서비스키 없으면 실제 조회 스킵 → mock 폴백

  const all = [];
  for (const region of REGIONS) {
    try {
      const items = await fetchRealRegion(region);
      all.push(...items);
    } catch (e) {
      console.warn(`[refresh-auctions] ${region} 조회 실패:`, e.message);
    }
  }
  return all.length > 0 ? all : null;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (it.case_number && !seen.has(it.case_number)) {
      seen.add(it.case_number);
      out.push(it);
    }
  }
  return out;
}

export default async () => {
  console.log('[refresh-auctions] 일일 데이터 갱신 시작...');

  let items = null;
  let source = 'mock';
  try {
    items = await collectItems();
    if (items) source = 'data.go.kr';
  } catch (e) {
    console.error('[refresh-auctions] 실제 조회 실패, mock으로 폴백:', e.message);
  }

  if (!items || items.length === 0) {
    items = generateItems();
    source = 'mock';
  }

  const deduped = dedupe(items);
  const payload = {
    items: deduped,
    last_update: new Date().toISOString().replace('T', ' ').slice(0, 19),
    source,
  };

  const store = getStore('auctions');
  await store.setJSON('latest.json', payload);

  console.log(`[refresh-auctions] 갱신 완료: ${deduped.length}건 저장 (source=${source})`);
};

export const config = {
  schedule: '0 23 * * *', // UTC 23:00 = KST 08:00
};
