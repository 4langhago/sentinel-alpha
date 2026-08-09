// Supabase 클라이언트 초기화
// 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 없으면 null을 반환한다.
// → authService가 자동으로 localStorage 폴백 모드로 동작하므로,
//   Supabase 프로젝트를 만들기 전에도 앱은 그대로 실행된다.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // 이메일 인증/OAuth 리다이렉트 처리
        },
      })
    : null

export const isSupabaseEnabled = supabase !== null

if (!isSupabaseEnabled && import.meta.env.DEV) {
  console.info(
    '[auth] Supabase 환경변수가 없어 localStorage 폴백 모드로 동작합니다. ' +
      '.env.local에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 설정하세요.'
  )
}
