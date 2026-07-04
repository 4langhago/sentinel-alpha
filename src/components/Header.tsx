import React from 'react'
import { Search, Building2, Calculator } from 'lucide-react'

const Header = () => {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Search className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">법원 경매 검색</h1>
          </div>
          <div className="flex items-center space-x-6 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <Building2 className="w-4 h-4" />
              <span>전국 법원 데이터</span>
            </div>
            <div className="flex items-center space-x-1">
              <Calculator className="w-4 h-4" />
              <span>투자 금액 계산</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
