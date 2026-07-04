export interface RegionData {
  id: string
  name: string
  districts: District[]
}

export interface District {
  id: string
  name: string
  courts: string[]
}

export const REGIONS_DATA: RegionData[] = [
  {
    id: 'seoul',
    name: '서울',
    districts: [
      { id: 'gangnam', name: '강남구', courts: ['서울중앙지방법원'] },
      { id: 'gangdong', name: '강동구', courts: ['서울동부지방법원'] },
      { id: 'gangbuk', name: '강북구', courts: ['서울북부지방법원'] },
      { id: 'gangseo_s', name: '강서구', courts: ['서울남부지방법원'] },
      { id: 'gwanak', name: '관악구', courts: ['서울남부지방법원'] },
      { id: 'gwangjin', name: '광진구', courts: ['서울동부지방법원'] },
      { id: 'guro', name: '구로구', courts: ['서울남부지방법원'] },
      { id: 'geumcheon', name: '금천구', courts: ['서울남부지방법원'] },
      { id: 'nowon', name: '노원구', courts: ['서울북부지방법원'] },
      { id: 'dobong', name: '도봉구', courts: ['서울북부지방법원'] },
      { id: 'dongdaemun', name: '동대문구', courts: ['서울동부지방법원'] },
      { id: 'dongjak', name: '동작구', courts: ['서울남부지방법원'] },
      { id: 'mapo', name: '마포구', courts: ['서울서부지방법원'] },
      { id: 'seodaemun', name: '서대문구', courts: ['서울서부지방법원'] },
      { id: 'seocho', name: '서초구', courts: ['서울중앙지방법원'] },
      { id: 'seongbuk', name: '성북구', courts: ['서울북부지방법원'] },
      { id: 'seongdong', name: '성동구', courts: ['서울동부지방법원'] },
      { id: 'songpa', name: '송파구', courts: ['서울동부지방법원'] },
      { id: 'yangcheon', name: '양천구', courts: ['서울남부지방법원'] },
      { id: 'yeongdeungpo', name: '영등포구', courts: ['서울남부지방법원'] },
      { id: 'yongsan', name: '용산구', courts: ['서울중앙지방법원'] },
      { id: 'eunpyeong', name: '은평구', courts: ['서울서부지방법원'] },
      { id: 'jongno', name: '종로구', courts: ['서울중앙지방법원'] },
      { id: 'jung_s', name: '중구', courts: ['서울중앙지방법원'] },
      { id: 'jungrang', name: '중랑구', courts: ['서울동부지방법원'] },
    ]
  },
  {
    id: 'gyeonggi',
    name: '경기',
    districts: [
      { id: 'suwon_yeongtong', name: '수원 영통구', courts: ['수원지방법원'] },
      { id: 'suwon_jangan', name: '수원 장안구', courts: ['수원지방법원'] },
      { id: 'suwon_gwonseon', name: '수원 권선구', courts: ['수원지방법원'] },
      { id: 'suwon_paldal', name: '수원 팔달구', courts: ['수원지방법원'] },
      { id: 'namyangju', name: '남양주시', courts: ['의정부지방법원'] },
      { id: 'hwaseong', name: '화성시 (동탄)', courts: ['수원지방법원 안산지원'] },
      { id: 'ansan', name: '안산시', courts: ['수원지방법원 안산지원'] },
      { id: 'uijeongbu', name: '의정부시', courts: ['의정부지방법원'] },
      { id: 'goyang', name: '고양시', courts: ['의정부지방법원'] },
      { id: 'seongnam', name: '성남시', courts: ['수원지방법원'] },
    ]
  },
  {
    id: 'incheon',
    name: '인천',
    districts: [
      { id: 'yeonsu', name: '연수구 (송도)', courts: ['인천지방법원'] },
      { id: 'namdong', name: '남동구', courts: ['인천지방법원'] },
      { id: 'bupyeong', name: '부평구', courts: ['인천지방법원'] },
      { id: 'jung_i', name: '중구', courts: ['인천지방법원'] },
      { id: 'seo_i', name: '서구', courts: ['인천지방법원'] },
    ]
  },
  {
    id: 'daegu',
    name: '대구',
    districts: [
      { id: 'jung_d', name: '중구', courts: ['대구지방법원'] },
      { id: 'seo_d', name: '서구', courts: ['대구지방법원'] },
      { id: 'nam_d', name: '남구', courts: ['대구지방법원'] },
      { id: 'buk_d', name: '북구', courts: ['대구지방법원'] },
      { id: 'dong_d', name: '동구', courts: ['대구지방법원'] },
      { id: 'suseong', name: '수성구', courts: ['대구지방법원'] },
      { id: 'dalseo', name: '달서구', courts: ['대구지방법원 서부지원'] },
      { id: 'dalseong', name: '달성군', courts: ['대구지방법원 서부지원'] },
    ]
  },
  {
    id: 'busan',
    name: '부산',
    districts: [
      { id: 'jung_b', name: '중구', courts: ['부산지방법원'] },
      { id: 'seo_b', name: '서구', courts: ['부산지방법원'] },
      { id: 'dong_b', name: '동구', courts: ['부산지방법원'] },
      { id: 'yeongdo', name: '영도구', courts: ['부산지방법원'] },
      { id: 'busanjin', name: '부산진구', courts: ['부산지방법원'] },
      { id: 'dongnae', name: '동래구', courts: ['부산지방법원'] },
      { id: 'nam_b', name: '남구', courts: ['부산지방법원'] },
      { id: 'buk_b', name: '북구', courts: ['부산지방법원'] },
      { id: 'haeundae', name: '해운대구', courts: ['부산지방법원'] },
      { id: 'saha', name: '사하구', courts: ['부산지방법원 서부지원'] },
      { id: 'geumjeong', name: '금정구', courts: ['부산지방법원 동부지원'] },
      { id: 'gangseo_b', name: '강서구', courts: ['부산지방법원 서부지원'] },
      { id: 'yeonje', name: '연제구', courts: ['부산지방법원'] },
      { id: 'suyeong', name: '수영구', courts: ['부산지방법원 동부지원'] },
      { id: 'sasang', name: '사상구', courts: ['부산지방법원'] },
      { id: 'gijang', name: '기장군', courts: ['부산지방법원 동부지원'] },
    ]
  },
  {
    id: 'ulsan',
    name: '울산',
    districts: [
      { id: 'jung_u', name: '중구', courts: ['울산지방법원'] },
      { id: 'nam_u', name: '남구', courts: ['울산지방법원'] },
      { id: 'dong_u', name: '동구', courts: ['울산지방법원'] },
      { id: 'buk_u', name: '북구', courts: ['울산지방법원'] },
      { id: 'ulju', name: '울주군', courts: ['울산지방법원 남부지원'] },
    ]
  },
  {
    id: 'gwangju',
    name: '광주',
    districts: [
      { id: 'dong_g', name: '동구', courts: ['광주지방법원'] },
      { id: 'seo_g', name: '서구', courts: ['광주지방법원'] },
      { id: 'nam_g', name: '남구', courts: ['광주지방법원'] },
      { id: 'buk_g', name: '북구', courts: ['광주지방법원'] },
      { id: 'gwangsan', name: '광산구', courts: ['광주지방법원'] },
    ]
  },
  {
    id: 'daejeon',
    name: '대전',
    districts: [
      { id: 'dong_dj', name: '동구', courts: ['대전지방법원'] },
      { id: 'jung_dj', name: '중구', courts: ['대전지방법원'] },
      { id: 'seo_dj', name: '서구', courts: ['대전지방법원'] },
      { id: 'yuseong', name: '유성구', courts: ['대전지방법원'] },
      { id: 'daedeok', name: '대덕구', courts: ['대전지방법원'] },
    ]
  },
  {
    id: 'gyeongnam',
    name: '경남',
    districts: [
      { id: 'changwon_seongsan', name: '창원 성산구', courts: ['창원지방법원'] },
      { id: 'changwon_uichang', name: '창원 의창구', courts: ['창원지방법원'] },
      { id: 'changwon_masan', name: '창원 마산', courts: ['창원지방법원'] },
      { id: 'jinju', name: '진주시', courts: ['창원지방법원'] },
    ]
  },
  {
    id: 'jeonbuk',
    name: '전북',
    districts: [
      { id: 'wansan', name: '완산구 (전주)', courts: ['전주지방법원'] },
      { id: 'deokjin', name: '덕진구 (전주)', courts: ['전주지방법원'] },
      { id: 'gunsan', name: '군산시', courts: ['전주지방법원'] },
    ]
  },
  {
    id: 'chungbuk',
    name: '충북',
    districts: [
      { id: 'heungdeok', name: '흥덕구 (청주)', courts: ['청주지방법원'] },
      { id: 'sangdang', name: '상당구 (청주)', courts: ['청주지방법원'] },
      { id: 'cheongwon', name: '청원구 (청주)', courts: ['청주지방법원'] },
    ]
  },
]
