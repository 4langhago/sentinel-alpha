// 검증 후 배포. 예약 실행(작업 스케줄러)에서도 그대로 쓴다.
//
// 왜 스크립트로 두는가: 2026-09-06에 netlify deploy가 Forbidden으로 계속
// 막혀 손으로 여러 번 재시도했다. 예약해 두고 자는 동안 돌리려면 (1) 실패해도
// 조용히 넘어가지 않고 (2) 무엇이 왜 실패했는지 로그로 남고 (3) 검증을
// 통과하지 못한 코드는 절대 올라가지 않아야 한다.
//
//   npm run deploy            검증 후 운영 배포
//   npm run deploy -- --dry   검증만 하고 배포는 하지 않음
//
// 배포 전에 타입체크·테스트·빌드를 모두 통과해야 한다. 하나라도 실패하면
// 배포하지 않고 종료 코드 1로 끝난다 — 예약 실행에서 실패를 알아챌 수 있어야 한다.
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dry = process.argv.includes('--dry')
const LOG_DIR = join(ROOT, '.omc', 'logs')
const LOG = join(LOG_DIR, 'deploy.log')

mkdirSync(LOG_DIR, { recursive: true })

const stamp = () => new Date().toISOString()
function say(line) {
  const msg = `[${stamp()}] ${line}`
  console.log(msg)
  try {
    appendFileSync(LOG, msg + '\n', 'utf8')
  } catch {
    /* 로그를 못 써도 배포 자체를 막지는 않는다 */
  }
}

/** 한 단계를 돌린다. 실패하면 그 자리에서 멈춘다. */
function step(name, cmd, args) {
  say(`▶ ${name}`)
  const r = spawnSync(cmd, args, { cwd: ROOT, shell: true, encoding: 'utf8' })
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim()
  const tail = out.split('\n').slice(-12).join('\n')
  if (r.status !== 0) {
    say(`✖ ${name} 실패 (exit ${r.status})`)
    say(tail)
    process.exit(1)
  }
  say(`✔ ${name}`)
  return out
}

say('='.repeat(60))
say(`배포 시작 (dry=${dry})`)

// 검증을 먼저. 여기서 막히면 아무것도 올라가지 않는다.
step('타입체크', 'npx', ['tsc', '--noEmit'])
step('테스트', 'npx', ['vitest', 'run'])
step('빌드', 'npm', ['run', 'build'])

if (dry) {
  say('--dry 모드라 배포하지 않고 끝냅니다. 검증은 모두 통과했습니다.')
  process.exit(0)
}

// 배포는 실패가 잦아(Forbidden 등) 몇 번 다시 시도한다. 간격을 두는 이유는
// 대부분의 실패가 순간적인 한도·인증 문제였기 때문이다.
const DELAYS_MS = [0, 60_000, 300_000, 900_000]
let deployed = false
for (let i = 0; i < DELAYS_MS.length; i++) {
  if (DELAYS_MS[i] > 0) {
    say(`${DELAYS_MS[i] / 1000}초 뒤 재시도 (${i + 1}/${DELAYS_MS.length})`)
    // 동기 대기. 예약 실행이라 붙잡고 있어도 되고, 비동기로 만들 이유가 없다.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, DELAYS_MS[i])
  }
  const r = spawnSync(
    'npx',
    ['netlify', 'deploy', '--prod', '--dir=dist', '--skip-functions-cache'],
    { cwd: ROOT, shell: true, encoding: 'utf8' }
  )
  const out = `${r.stdout || ''}${r.stderr || ''}`
  if (r.status === 0) {
    const url = out.match(/Unique deploy URL:\s*<?([^\s>]+)/)
    say(`✔ 배포 완료 ${url ? url[1] : ''}`)
    deployed = true
    break
  }
  say(`✖ 배포 실패 (exit ${r.status}): ${out.trim().split('\n').slice(-3).join(' | ')}`)
}

if (!deployed) {
  say('배포에 끝내 실패했습니다. 로그를 확인하세요: ' + LOG)
  process.exit(1)
}

// 배포됐다고 끝이 아니다. 실제로 응답하는지 확인한다.
// IPv6 경로가 막힌 환경이 있어 IPv4를 강제한다(2026-09-06에 겪음).
say('▶ 스모크 테스트')
const smoke = spawnSync(
  'curl',
  ['-s', '-4', '-m', '60', '-o', 'NUL', '-w', '%{http_code}',
   'https://auction-insight-kr.netlify.app/api/health'],
  { cwd: ROOT, shell: true, encoding: 'utf8' }
)
const code = (smoke.stdout || '').trim()
if (code === '200') {
  say('✔ 스모크 통과 (health 200)')
} else {
  say(`✖ 스모크 실패 (health ${code || '응답 없음'}) — 배포는 됐으나 확인이 필요합니다.`)
  process.exit(1)
}
say('배포 절차 정상 종료')
