// 샤드 키 검증 유틸.
//
// 샤드 키는 `sgg/11110.json` 처럼 우리가 만든 경로지만, 그 안의 코드값은
// `?sgg_code=` 같은 **사용자 쿼리 파라미터에서 그대로 온다**. 검증 없이
// `new URL('../data/' + key)` 에 넣으면 `../../../package.json` 같은 값으로
// data 디렉터리를 탈출해 임의의 JSON 파일을 읽을 수 있다(경로 조작).
//
// 그래서 파일을 읽기 직전, 한 곳에서 키를 검증한다. 호출자마다 각자
// 이스케이프하게 두면 새 라우트를 추가할 때 빠뜨리기 쉽다.

// 허용하는 키 형태: 영숫자·한글·하이픈·언더스코어·슬래시로 된 경로 + .json
//
// **한글을 반드시 허용해야 한다.** 기존 실거래 샤드가 `sido/서울.json`,
// `type/APT-서울.json` 처럼 한글 시도명을 키에 쓴다. 영숫자만 허용하면
// 지역별 조회가 통째로 깨진다.
const SAFE_KEY = /^[A-Za-z0-9가-힣ㄱ-ㅎㅏ-ㅣ_\-/]+\.json$/

/**
 * 샤드 키가 안전한지 검사한다.
 * 상위 경로 이동(..), 절대경로, 백슬래시, 널바이트, 허용 문자 밖의 값을 전부 막는다.
 *
 * @returns {boolean} 안전하면 true
 */
export function isSafeShardKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 200) return false
  if (key.includes('\0')) return false
  if (key.includes('..')) return false // 상위 경로 이동
  if (key.includes('\\')) return false // 윈도우 경로 구분자
  if (key.startsWith('/')) return false // 절대경로
  if (key.includes('//')) return false
  return SAFE_KEY.test(key)
}
