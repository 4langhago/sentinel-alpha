// 샤드 파일을 원자적으로 쓴다.
//
// 왜 필요한가: 2026-09-06에 orphan.json이 깨진 채로 발견됐다. 13,620,597바이트
// 중 앞 12,410,937바이트만 유효한 JSON이었고, 뒤 1.2MB는 더 길었던 예전 문서의
// 꼬리였다. JSON.parse가 통째로 실패해 그 샤드에만 있던 10,876건을 읽을 수
// 없는 상태였다(다행히 시군구 샤드와 합쳐 복원 가능했다).
//
// 이 서명 — "짧은 새 문서 + 긴 옛 문서의 꼬리" — 은 한 파일을 두 프로세스가
// 동시에 덮어쓸 때 나온다. collect:auction / auction:repair-sido /
// auction:rebuild-shards 는 모두 같은 경로에 writeFileSync로 바로 쓰고
// 있었고, 서로를 막는 장치가 없었다. 두 터미널에서 잇따라 돌리면 재현된다.
//
// 임시 파일에 다 쓰고 rename으로 갈아끼우면, 읽는 쪽은 항상 완결된 문서만
// 본다(rename은 같은 볼륨에서 원자적이다). 쓰기 직후 다시 파싱해 확인까지 한다
// — 깨진 파일을 만들어 놓고 성공했다고 보고하는 것이 가장 나쁘다.
import { writeFileSync, renameSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * JSON 값을 파일에 원자적으로 쓴다.
 *
 * @param {string} path 최종 경로
 * @param {unknown} value JSON으로 직렬화할 값
 */
export function writeJsonAtomic(path, value) {
  const body = JSON.stringify(value)
  mkdirSync(dirname(path), { recursive: true })
  // 프로세스 id를 붙여, 두 프로세스가 동시에 돌아도 임시 파일끼리 부딪히지 않게 한다.
  const tmp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, body, 'utf8')
    // 쓴 것을 도로 읽어 파싱해 본다. 여기서 걸리면 최종 경로는 건드리지 않았으므로
    // 기존 파일이 그대로 남는다 — 깨진 것으로 멀쩡한 것을 덮지 않는다.
    JSON.parse(readFileSync(tmp, 'utf8'))
    renameSync(tmp, path)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch {
      /* 임시 파일이 없으면 그만이다 */
    }
    throw new Error(`샤드 쓰기 실패(${path}): ${e.message}`)
  }
}

/**
 * JSON 파일을 읽는다. 깨져 있으면 조용히 넘어가지 않고 던진다.
 *
 * 조용한 실패가 이번 사고를 키웠다. 읽는 쪽이 파싱 실패를 "파일 없음"으로
 * 처리하면, 손상이 그 샤드에만 있던 물건의 소리 없는 유실이 된다.
 */
export function readJsonStrict(path) {
  const raw = readFileSync(path, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(
      `샤드가 손상됐습니다(${path}): ${e.message}\n` +
        `  길이 ${raw.length.toLocaleString()}자. 문서 뒤에 잔해가 붙은 경우라면 ` +
        `유효한 앞부분만 남기고 잘라낸 뒤 npm run auction:rebuild-shards 로 재생성하세요.`
    )
  }
}
