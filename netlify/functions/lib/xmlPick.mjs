// data.go.kr 계열 오픈API 공용 XML 유틸
//
// MOLIT(실거래)와 온비드(공매)는 서로 다른 서비스지만 같은 data.go.kr 게이트웨이를 쓴다.
// 응답이 XML이고, 서비스 개편으로 태그명이 구버전(한글)과 신버전(영문)이 섞여 있으며,
// 에러도 HTTP 상태가 아니라 본문 XML로 돌려주는 규약이 동일하다.
// 두 클라이언트가 같은 파싱 규칙을 쓰도록 여기 한 곳에 둔다.

/** XML 조각 안에서 여러 후보 태그명 중 처음 발견되는 값을 꺼낸다. */
export const pick = (body, ...names) => {
  for (const n of names) {
    const m = body.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))
    if (m) {
      const v = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
      if (v) return v
    }
  }
  return ''
}

export const toInt = (v) => {
  const n = parseInt(String(v).replace(/[,\s]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

export const toFloat = (v) => {
  const n = parseFloat(String(v).replace(/[,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** API가 에러 XML을 돌려줬는지 확인하고, 그렇다면 사람이 읽을 메시지를 만든다. */
export const readError = (xml) => {
  const code = pick(xml, 'returnReasonCode', 'resultCode')
  const msg = pick(xml, 'returnAuthMsg', 'errMsg', 'resultMsg')
  if (!msg) return null
  // 정상 응답도 resultCode 00 / "NORMAL SERVICE."를 담고 있으므로 제외
  if (/^0*0$/.test(code) || /NORMAL/i.test(msg)) return null
  return `${msg}${code ? ` (code ${code})` : ''}`
}

/**
 * data.go.kr은 "일반 인증키(Encoding)"와 "(Decoding)" 두 가지를 보여준다.
 * Encoding 키를 그대로 URLSearchParams에 넣으면 %가 다시 인코딩돼(%2B → %252B)
 * 인증에 실패한다. 인코딩된 형태로 보이면 한 번 디코딩해서 사용한다.
 */
export function normalizeServiceKey(key) {
  const k = (key || '').trim()
  if (!k) return ''
  if (/%[0-9A-Fa-f]{2}/.test(k)) {
    try {
      return decodeURIComponent(k)
    } catch {
      return k
    }
  }
  return k
}
