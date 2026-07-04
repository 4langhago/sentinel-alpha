import React, { useState } from 'react'
import { MapPin } from 'lucide-react'
import { REGIONS_DATA, RegionData, District } from '../data/regions'

interface RegionSelectorProps {
  selectedRegions: string[]
  onRegionChange: (regions: string[]) => void
}

const RegionSelector: React.FC<RegionSelectorProps> = ({ selectedRegions, onRegionChange }) => {
  const [activeTab, setActiveTab] = useState<string>('seoul')

  const handleDistrictToggle = (districtId: string) => {
    const newSelection = selectedRegions.includes(districtId)
      ? selectedRegions.filter(id => id !== districtId)
      : [...selectedRegions, districtId]
    onRegionChange(newSelection)
  }

  const getSelectedCount = () => {
    return selectedRegions.length
  }

  const getSelectedDistrictsText = () => {
    if (selectedRegions.length === 0) return '선택된 지역 없음'
    
    const districtNames = selectedRegions.map(id => {
      for (const region of REGIONS_DATA) {
        const district = region.districts.find(d => d.id === id)
        if (district) return district.name
      }
      return ''
    }).filter(Boolean)
    
    return districtNames.join(', ')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <MapPin className="w-5 h-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-gray-900">지역 선택</h3>
        {getSelectedCount() > 0 && (
          <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded-full text-sm font-medium">
            {getSelectedCount()}개 선택
          </span>
        )}
      </div>

      {/* 지역 탭(좌) + 지역구(우) 한 줄 */}
      <div className="flex gap-3">
        {/* 지역 탭 - 세로 목록 */}
        <div className="flex flex-col border-r border-gray-200 pr-3 shrink-0 space-y-1">
          {REGIONS_DATA.map((region) => (
            <button
              key={region.id}
              onClick={() => setActiveTab(region.id)}
              className={`px-4 py-2 font-medium text-sm rounded-lg text-left transition-colors whitespace-nowrap ${
                activeTab === region.id
                  ? 'bg-primary-50 text-primary-600 font-semibold'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {region.name}
            </button>
          ))}
        </div>

        {/* 구/군 목록 */}
        <div className="flex-1 grid grid-cols-3 gap-2 content-start">
          {REGIONS_DATA.map((region) =>
            activeTab === region.id &&
            region.districts.map((district) => (
              <button
                key={district.id}
                onClick={() => handleDistrictToggle(district.id)}
                className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 ${
                  selectedRegions.includes(district.id)
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {district.name}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 선택된 지역 표시 */}
      {selectedRegions.length > 0 && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700 font-medium">선택된 지역:</p>
          <p className="text-sm text-blue-600 mt-1">{getSelectedDistrictsText()}</p>
        </div>
      )}
    </div>
  )
}

export default RegionSelector
