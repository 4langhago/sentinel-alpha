import React from 'react'
import { Link } from 'react-router-dom'
import { Search, Heart, Calculator, Shield, Mail, Github, ExternalLink } from 'lucide-react'

const Footer = () => {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-gray-900 text-gray-400">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Search className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold text-lg">경매 인사이트</span>
            </div>
            <p className="text-sm leading-relaxed mb-4 max-w-xs">
              AI 기반 한국 법원 경매 분석 플랫폼. 실시간 데이터와 머신러닝으로 최고의 투자 기회를 발굴합니다.
            </p>
            <div className="flex items-center space-x-3">
              <a href="mailto:contact@auction-insight.kr" className="hover:text-white transition-colors">
                <Mail className="w-5 h-5" />
              </a>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* 서비스 */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">서비스</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/search" className="hover:text-white transition-colors flex items-center space-x-1"><Search className="w-3 h-3" /><span>경매 검색</span></Link></li>
              <li><Link to="/calculator" className="hover:text-white transition-colors flex items-center space-x-1"><Calculator className="w-3 h-3" /><span>수익 계산기</span></Link></li>
              <li><Link to="/favorites" className="hover:text-white transition-colors flex items-center space-x-1"><Heart className="w-3 h-3" /><span>관심 물건</span></Link></li>
            </ul>
          </div>

          {/* 법적 고지 */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">법적 고지</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://www.courtauction.go.kr" target="_blank" rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center space-x-1">
                  <ExternalLink className="w-3 h-3" />
                  <span>법원경매정보 공식사이트</span>
                </a>
              </li>
              <li className="flex items-center space-x-1">
                <Shield className="w-3 h-3" />
                <span>개인정보처리방침</span>
              </li>
              <li><span>이용약관</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6 flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0">
          <p className="text-xs">
            © {year} 경매 인사이트. All rights reserved.
          </p>
          <p className="text-xs text-center">
            본 서비스는 정보 제공 목적이며, 투자 판단의 책임은 이용자에게 있습니다.
            데이터 출처: 대한민국 법원 경매정보
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
