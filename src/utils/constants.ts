// 앱 상수 및 공통 데이터

export const PROPERTY_TYPES = [
  { value: 'all', label: '전체' },
  { value: 'apartment', label: '아파트' },
  { value: 'house', label: '주택' },
  { value: 'commercial', label: '상가' },
  { value: 'land', label: '토지' },
  { value: 'office', label: '오피스' }
] as const

export const AUCTION_STATUS = [
  { value: 'all', label: '전체', color: 'gray' },
  { value: 'scheduled', label: '예정', color: 'blue' },
  { value: 'ongoing', label: '진행중', color: 'green' },
  { value: 'completed', label: '완료', color: 'red' }
] as const

export const COURTS = [
  { value: 'all', label: '전체' },
  { value: 'seoul', label: '서울중앙지방법원' },
  { value: 'busan', label: '부산지방법원' },
  { value: 'daegu', label: '대구지방법원' },
  { value: 'incheon', label: '인천지방법원' },
  { value: 'gwangju', label: '광주지방법원' },
  { value: 'daejeon', label: '대전지방법원' },
  { value: 'ulsan', label: '울산지방법원' }
] as const

export const INVESTMENT_RANGES = [
  { value: 'all', label: '전체', min: 0, max: Infinity },
  { value: '0-5000', label: '5천만원 이하', min: 0, max: 50000000 },
  { value: '5000-10000', label: '5천만-1억', min: 50000000, max: 100000000 },
  { value: '10000-20000', label: '1-2억', min: 100000000, max: 200000000 },
  { value: '20000-50000', label: '2-5억', min: 200000000, max: 500000000 },
  { value: '50000+', label: '5억이상', min: 500000000, max: Infinity }
] as const
