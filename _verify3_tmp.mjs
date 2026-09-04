const ids = [
  "2021-02168-407-6186184",
  "2021-09579-010-6186185",
  "2022-03851-010-6180261",
  "2023-05019-006-6184744",
  "2023-05189-009-6182135",
]
for (const id of ids) {
  const url = `https://auction-insight-kr.netlify.app/api/auctions/${encodeURIComponent(id)}`
  const res = await fetch(url)
  const j = await res.json()
  const it = j.item || j
  console.log(id, JSON.stringify({
    min_bid_price: it.min_bid_price, appraisal_price: it.appraisal_price,
    discount_rate: it.discount_rate, bid_start_at: it.bid_start_at, bid_end_at: it.bid_end_at,
    area: it.area, land_area: it.land_area, sgg_code: it.sgg_code, fail_count: it.fail_count,
    bid_round: it.bid_round, status: it.status,
  }))
}
