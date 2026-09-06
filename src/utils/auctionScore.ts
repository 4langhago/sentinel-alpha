// 추천 점수의 타입 껍데기.
//
// 실제 계산은 netlify/functions/lib/auctionScore.mjs 한 곳에만 있다.
// 서버가 정렬에 쓰는 점수와 카드에 찍히는 점수가 다르면 사용자는 둘 중
// 무엇도 믿을 수 없으므로, 구현을 둘로 나누지 않는다. 여기서는 타입만 얹어
// 화면 쪽에서 안전하게 쓰도록 다시 내보낸다.
import {
  scoreAuction as scoreAuctionImpl,
  scoreTotal as scoreTotalImpl,
  rankAuctions as rankAuctionsImpl,
  WEIGHTS as WEIGHTS_IMPL,
} from '../../netlify/functions/lib/auctionScore.mjs'
import { AuctionItem } from '../types/auction'
import type { RegionStats } from '../types/trade'

/** 시세 비교에 필요한 부분만 받는다. */
export type MarketStats = Pick<RegionStats, 'per_property'>

export interface ScoreAxis {
  key: 'discount' | 'market' | 'failCount' | 'penalty'
  label: string
  /** 이 축이 낸 점수. 감점 축은 음수다. */
  points: number
  /** 이 축의 만점(감점 축은 최대 감점 폭을 음수로). */
  max: number
  /** 어떻게 이 점수가 나왔는지. 사용자가 검증할 수 있어야 한다. */
  basis: string
}

export interface AuctionScore {
  /** 0~100. 축 점수의 합을 0 아래로 내려가지 않게 자른 값. */
  total: number
  axes: ScoreAxis[]
  /**
   * 점수를 매길 근거가 모자란 물건인지.
   * 최저가가 비공개거나 감정가가 없으면 체감률조차 못 구한다. 이런 물건에
   * 낮은 점수를 주면 "나쁜 물건"으로 오해되므로 순위에서 뺀다.
   */
  scorable: boolean
  /** 점수에 반영되지 못한 것. 화면에 그대로 노출한다. */
  caveats: string[]
}

export const WEIGHTS: {
  discount: number
  market: number
  failCount: number
  penalty: number
} = WEIGHTS_IMPL

export const scoreAuction = (item: AuctionItem, marketStats?: MarketStats): AuctionScore =>
  scoreAuctionImpl(item, marketStats)

/** 총점만 낸다(근거 문장을 만들지 않는다). 잴 수 없으면 null. */
export const scoreTotal = (item: AuctionItem, marketStats?: MarketStats): number | null =>
  scoreTotalImpl(item, marketStats)

export const rankAuctions = <T extends AuctionItem>(
  items: T[],
  marketStats?: MarketStats
): Array<{ item: T; score: AuctionScore }> => rankAuctionsImpl(items, marketStats)
