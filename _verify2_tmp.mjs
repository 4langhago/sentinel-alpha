import { normalizeServiceKey } from './netlify/functions/lib/xmlPick.mjs'
import { pick, toInt, toFloat } from './netlify/functions/lib/xmlPick.mjs'
import fs from 'fs'

const xml = fs.readFileSync('_onbid_sample.xml', 'utf8')
const items = []
for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
  const g = (n) => pick(m[1], n)
  items.push({
    cltrMngNo: g('cltrMngNo'),
    pbctCdtnNo: g('pbctCdtnNo'),
    onbidCltrNm: g('onbidCltrNm'),
    apslEvlAmt: g('apslEvlAmt'),
    lowstBidPrcIndctCont: g('lowstBidPrcIndctCont'),
    cltrBidBgngDt: g('cltrBidBgngDt'),
    cltrBidEndDt: g('cltrBidEndDt'),
    ltnoPnu: g('ltnoPnu'),
    rdnmPnu: g('rdnmPnu'),
    landSqms: g('landSqms'),
    bldSqms: g('bldSqms'),
    usbdNft: g('usbdNft'),
    pbctNsq: g('pbctNsq'),
    pbctStatCd: g('pbctStatCd'),
    pbctStatNm: g('pbctStatNm'),
  })
}
console.log('total items in sample:', items.length)
console.log(JSON.stringify(items.slice(0, 8), null, 1))
