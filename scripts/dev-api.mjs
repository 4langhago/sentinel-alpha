// 로컬 개발용 API 서버
// Netlify Functions의 api.mjs를 그대로 http://localhost:8000 에서 서빙한다.
// vite dev의 /api 프록시가 이 서버로 요청을 넘긴다. (netlify dev 없이도 개발 가능)
import { createServer } from 'node:http'

const PORT = Number(process.env.DEV_API_PORT || 8000)

const server = createServer(async (req, res) => {
  try {
    // 함수 코드를 매 요청마다 새로 읽어 수정 사항이 바로 반영되게 한다.
    const mod = await import(`../netlify/functions/api.mjs?t=${Date.now()}`)
    const url = new URL(req.url, `http://localhost:${PORT}`)
    // api.mjs는 /api 접두어를 스스로 제거하므로 붙여서 넘긴다.
    const request = new Request(`http://localhost${url.pathname.startsWith('/api') ? '' : '/api'}${url.pathname}${url.search}`, {
      method: req.method,
    })

    const response = await mod.default(request)
    const body = await response.text()

    res.writeHead(response.status, {
      'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(body)
    console.log(`${req.method} ${url.pathname}${url.search} → ${response.status}`)
  } catch (e) {
    console.error('[dev-api]', e)
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ detail: e.message }))
  }
})

server.listen(PORT, () => console.log(`[dev-api] http://localhost:${PORT} 에서 대기 중`))
