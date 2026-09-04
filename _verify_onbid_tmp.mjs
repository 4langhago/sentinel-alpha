import { normalizeServiceKey } from './netlify/functions/lib/xmlPick.mjs'
import fs from 'fs'
const env = fs.readFileSync('.env.local','utf8')
const key = env.match(/ONBID_API_KEY=(.+)/)[1].trim()
const serviceKey = normalizeServiceKey(key)

const BASE = 'https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2'
const params = new URLSearchParams({
  serviceKey, numOfRows: '20', pageNo: '1', prptDivCd: '0007', pvctTrgtYn: 'N',
})
const res = await fetch(`${BASE}?${params}`)
const xml = await res.text()
fs.writeFileSync('_onbid_sample.xml', xml)
console.log('status', res.status, 'len', xml.length)
