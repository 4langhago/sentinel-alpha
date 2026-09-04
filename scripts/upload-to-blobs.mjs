// 로컬에 수집된 샤드를 운영 Netlify Blobs로 직접 올린다.
//
// 왜 필요한가: 전량 수집은 Netlify 함수 실행 시간 안에 끝나지 않는다(실거래·공매 모두).
// 그래서 최초 적재와 복구는 로컬에서 수집한 결과를 그대로 올리는 편이 확실하다.
// 이후의 증분 갱신은 스케줄 함수가 맡는다.
//
//   npm run blobs:upload              (둘 다)
//   npm run blobs:upload -- trades    (실거래만)
//   npm run blobs:upload -- auctions  (공매만)
//
// 인증은 Netlify CLI가 저장해 둔 토큰을 재사용한다(별도 로그인 불필요).
// 사이트 ID는 .netlify/state.json 에서 읽는다.
import { readFile, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { getStore } from '@netlify/blobs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_ROOT = join(ROOT, 'netlify/functions/data')

/**
 * 스토어별 설정.
 * - dir: 로컬 데이터 디렉터리
 * - keyPrefix: Blobs 키 접두어(공매는 auction/ 아래에 모여 있다)
 * - indexKey: 마지막에 써야 하는 인덱스 키
 */
const STORES = {
  trades: { dir: DATA_ROOT, keyPrefix: '', indexKey: 'index.json', skipDirs: ['auction'] },
  auctions: { dir: join(DATA_ROOT, 'auction'), keyPrefix: 'auction/', indexKey: 'auction/index.json', skipDirs: [] },
}

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

/** 디렉터리 아래 모든 json 파일을 Blobs 키와 함께 나열한다. */
const listShards = async (dir, base, keyPrefix, skipDirs) => {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue
      out.push(...(await listShards(join(dir, entry.name), base, keyPrefix, skipDirs)))
    } else if (entry.name.endsWith('.json')) {
      const rel = relative(base, join(dir, entry.name)).split('\\').join('/')
      out.push({ key: keyPrefix + rel, file: join(dir, entry.name) })
    }
  }
  return out
}

const uploadStore = async (name, { siteID, token }) => {
  const cfg = STORES[name]
  if (!existsSync(cfg.dir)) {
    console.error(`  ${name}: 로컬 데이터 없음 (${cfg.dir}) — 건너뜁니다.`)
    return false
  }

  const store = getStore({ name, siteID, token })
  const shards = await listShards(cfg.dir, cfg.dir, cfg.keyPrefix, cfg.skipDirs)

  // 인덱스는 화면이 "데이터가 있다"고 판단하는 기준이라, 나머지가 모두 올라간 뒤
  // 마지막에 쓴다. 중간에 실패해도 반쪽 상태로 보이지 않는다.
  const indexShard = shards.find((s) => s.key === cfg.indexKey)
  const rest = shards.filter((s) => s.key !== cfg.indexKey)

  const idx = indexShard ? JSON.parse(await readFile(indexShard.file, 'utf8')) : null
  console.log(
    `\n[${name}] 샤드 ${shards.length}개` +
      (idx ? ` · ${(idx.total_items ?? 0).toLocaleString()}건 · 수집 ${idx.last_update}` : '')
  )

  let done = 0
  let failed = 0
  const CONCURRENCY = 24
  for (let i = 0; i < rest.length; i += CONCURRENCY) {
    const batch = rest.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async ({ key, file }) => {
        try {
          await store.set(key, await readFile(file, 'utf8'))
          done++
        } catch (e) {
          failed++
          console.error(`   실패 ${key}: ${e.message}`)
        }
      })
    )
    process.stdout.write(`\r   ${done}/${rest.length}`)
  }
  process.stdout.write('\n')

  if (failed > 0) {
    console.error(`   ${failed}개 실패 — 인덱스를 쓰지 않았습니다. 다시 실행하세요.`)
    return false
  }
  if (indexShard) await store.set(indexShard.key, await readFile(indexShard.file, 'utf8'))
  console.log(`   완료 — ${done + 1}개 업로드`)
  return true
}

const token = readCliToken()
const siteID = readSiteId()
const which = process.argv[2] || 'all'
const targets = which === 'all' ? Object.keys(STORES) : [which]

if (!token || !siteID) {
  console.error(
    '\n인증 정보를 찾지 못했습니다.\n' +
      '  netlify login 으로 로그인했는지 확인하거나,\n' +
      '  NETLIFY_AUTH_TOKEN / NETLIFY_SITE_ID 환경변수를 설정하세요.\n'
  )
  process.exitCode = 1
} else if (targets.some((t) => !STORES[t])) {
  console.error(`\n알 수 없는 대상: ${targets.filter((t) => !STORES[t]).join(', ')}`)
  console.error(`가능한 값: ${Object.keys(STORES).join(', ')}, all\n`)
  process.exitCode = 1
} else {
  let ok = true
  for (const t of targets) ok = (await uploadStore(t, { siteID, token })) && ok
  if (!ok) process.exitCode = 1
}
