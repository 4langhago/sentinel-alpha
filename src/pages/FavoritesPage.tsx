import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Search, Trash2, Building2 } from 'lucide-react'
import { getFavorites, toggleFavorite, syncFavoritesOnLogin } from '../services/favoriteService'
import { tradeApi } from '../services/tradeApi'
import { ComplexDetail, formatPrice } from '../types/trade'
import { useAuth } from '../contexts/AuthContext'

const FavoritesPage = () => {
  const { isLoggedIn, isCloudAuth, openAuthModal } = useAuth()
  const [names, setNames] = useState<string[]>(() => getFavorites())
  const [details, setDetails] = useState<Record<string, ComplexDetail | null>>({})
  const [loading, setLoading] = useState(true)

  // 로그인 상태면 서버 목록과 합쳐서 가져온다.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const list = isLoggedIn ? await syncFavoritesOnLogin() : getFavorites()
      if (alive) setNames(list)
    })()
    return () => {
      alive = false
    }
  }, [isLoggedIn])

  useEffect(() => {
    let alive = true
    if (names.length === 0) {
      setDetails({})
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all(names.map((n) => tradeApi.complex(n).then((d) => [n, d] as const))).then((pairs) => {
      if (!alive) return
      setDetails(Object.fromEntries(pairs))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [names.join('|')])

  const remove = (name: string) => {
    toggleFavorite(name)
    setNames(getFavorites())
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-1 flex items-center gap-2">
          <Heart className="w-7 h-7 text-rose-500" />
          관심 단지
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {isLoggedIn && isCloudAuth
            ? '로그인 계정에 저장되어 다른 기기에서도 볼 수 있습니다.'
            : '현재 이 브라우저에만 저장됩니다. 로그인하면 기기 간 동기화됩니다.'}
        </p>
      </div>

      {!isLoggedIn && isCloudAuth && names.length > 0 && (
        <button
          onClick={() => openAuthModal('login')}
          className="w-full text-left bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300 rounded-xl px-4 py-3 text-sm hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
        >
          로그인하면 관심 단지가 계정에 저장되어 기기를 바꿔도 유지됩니다. →
        </button>
      )}

      {names.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-200 font-semibold mb-1">아직 관심 단지가 없습니다</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            단지 상세 화면에서 '관심 등록'을 누르면 여기에 모입니다.
          </p>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold"
          >
            <Search className="w-4 h-4" /> 단지 찾아보기
          </Link>
        </div>
      ) : loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {names.map((n) => (
            <div key={n} className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {names.map((name) => {
            const d = details[name]
            return (
              <div
                key={name}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/complex/${encodeURIComponent(name)}`} className="min-w-0 group">
                    <h3 className="font-bold text-gray-900 dark:text-white truncate group-hover:text-violet-600">
                      {name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {d ? `${d.region_name} ${d.address}` : '거래 내역 없음'}
                    </p>
                  </Link>
                  <button
                    onClick={() => remove(name)}
                    aria-label={`${name} 관심 해제`}
                    className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {d ? (
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">중위가</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {formatPrice(d.median_price)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">평당가</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {Math.round(d.median_per_pyeong / 10000).toLocaleString()}만원
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">최근 거래</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{d.latest_deal_date}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-gray-400 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    수집 기간 내 거래가 없습니다.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FavoritesPage
