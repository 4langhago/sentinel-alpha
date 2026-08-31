// 로컬에 수집된 공매 샤드를 운영 Netlify Blobs로 직접 올린다.
//
// 왜 필요한가: 전량 수집은 25분이 걸리는데 Netlify 함수는 그렇게 오래 돌 수 없다.
// 그래서 최초 적재(백필)는 로컬에서 수집한 결과를 그대로 올리는 편이 확실하다.
// 이후의 증분 갱신은 스케줄 함수(refresh-auctions)가 맡는다.
//
//   npm run auction:upload
//
// 인증은 Netlify CLI가 저장해 둔 토큰을 재사용한다(별도 로그인 불필요).
// 사이트 ID는 .netlify/state.json 에서 읽는다.
import { readFile, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { getStore } from '@netlify/blobs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'netlify/functions/data/auction')

/** Netlify CLI가 저장해 둔 개인 액세스 토큰을 찾는다. */
const readCliToken = () => {
  if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN
  const candidates = [
    join(homedir(), '.netlify', 'config.json'),
    join(process.env.APPDATA || '', 'netlify', 'Config', 'config.json'),
    join(homedir(), 'AppData', 'Roaming', 'netlify', 'Config', 'config.json'),
  ]
  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      const cfg = JSON.parse(readFileSync(p, 'utf8'))
      const user = cfg.users ? Object.values(cfg.users)[0] : null
      if (user?.auth?.token) return user.auth.token
    } catch {
      // 다음 후보로
    }
  }
  return ''
}

const readSiteId = () => {
  if (process.env.NETLIFY_SITE_ID) return process.env.NETLIFY_SITE_ID
  try {
    return JSON.parse(readFileSync(join(ROOT, '.netlify/state.json'), 'utf8')).siteId || ''
  } catch {
    return ''
  }
}

/** data/auction 아래 모든 json 파일을 Blobs 키 경로와 함께 나열한다. */
const listShards = async (dir, prefix = 'auction') => {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listShards(full, `${prefix}/${entry.name}`)))
    else if (entry.name.endsWith('.json')) out.push({ key: `${prefix}/${entry.name}`, file: full })
  }
  return out
}

const token = readCliToken()
const siteID = readSiteId()

if (!token || !siteID) {
  console.error(
    '\n인증 정보를 찾지 못했습니다.\n' +
      '  netlify login 으로 로그인했는지 확인하거나,\n' +
      '  NETLIFY_AUTH_TOKEN / NETLIFY_SITE_ID 환경변수를 설정하세요.\n'
  )
  process.exitCode = 1
} else if (!existsSync(DATA_DIR)) {
  console.error(`\n로컬 공매 데이터가 없습니다: ${DATA_DIR}\n먼저 npm run collect:auction 을 실행하세요.\n`)
  process.exitCode = 1
} else {
  const store = getStore({ name: 'auctions', siteID, token })
  const shards = await listShards(DATA_DIR)

  // index.json은 화면이 "데이터가 있다"고 판단하는 기준이라, 나머지가 모두
  // 올라간 뒤 마지막에 쓴다. 중간에 실패해도 반쪽 상태로 보이지 않는다.
  const indexShard = shards.find((s) => s.key === 'auction/index.json')
  const rest = shards.filter((s) => s.key !== 'auction/index.json')

  console.log(`공매 샤드 업로드 — ${shards.length}개 → Blobs(auctions)`)

  let done = 0
  let failed = 0
  const CONCURRENCY = 8
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const batch = rest.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async ({ key, file }) => {
        try {
          await store.set(key, await readFile(file, 'utf8'))
          done++
        } catch (e) {
          failed++
          console.error(`  실패 ${key}: ${e.message}`)
        }
      })
    )
    if (done % 40 === 0 || i + CONCURRENCY >= rest.length) {
      console.log(`  ${done}/${rest.length}`)
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}개 샤드가 실패해 index.json을 쓰지 않았습니다. 다시 실행하세요.`)
    process.exitCode = 1
  } else if (indexShard) {
    await store.set(indexShard.key, await readFile(indexShard.file, 'utf8'))
    const idx = JSON.parse(await readFile(indexShard.file, 'utf8'))
    console.log(`\n업로드 완료 — 샤드 ${done + 1}개, 물건 ${idx.total_items?.toLocaleString?.() ?? '?'}건`)
  }
}
