// 공통 헬퍼 함수

export const formatPrice = (price: number): string => {
  if (price >= 100000000) {
    return `${(price / 100000000).toFixed(1)}억원`
  } else if (price >= 10000) {
    return `${(price / 10000).toFixed(0)}만원`
  }
  return `${price.toLocaleString()}원`
}

export const formatDate = (date: Date | string): string => {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-800',
    ongoing: 'bg-green-100 text-green-800',
    completed: 'bg-red-100 text-red-800',
    default: 'bg-gray-100 text-gray-800'
  }
  return colors[status] || colors.default
}

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}
