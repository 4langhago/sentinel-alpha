import React, { useState } from 'react'
import { Building2, Home, ShoppingBag, LandPlot, Factory, Trees, Landmark } from 'lucide-react'
import { PropertyType } from '../types/auction'

interface PropertyImageProps {
  src?: string
  alt?: string
  propertyType?: PropertyType
  caseNumber?: string
  className?: string
}

const TYPE_META: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  [PropertyType.APARTMENT]: { label: '아파트·오피스텔', Icon: Building2, color: 'text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/40' },
  [PropertyType.HOUSE]:     { label: '빌라·주택',       Icon: Home,      color: 'text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-950/40'   },
  [PropertyType.COMMERCIAL]:{ label: '상가·사무실',     Icon: ShoppingBag,color:'text-emerald-400',bg: 'bg-emerald-50 dark:bg-emerald-950/40'},
  [PropertyType.LAND]:      { label: '토지·대지',       Icon: LandPlot,  color: 'text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950/40'  },
  [PropertyType.OFFICE]:    { label: '공장·창고',       Icon: Factory,   color: 'text-slate-400',  bg: 'bg-slate-50 dark:bg-slate-950/40'  },
  [PropertyType.OTHER]:     { label: '기타',             Icon: Landmark,  color: 'text-gray-400',   bg: 'bg-gray-50 dark:bg-gray-900'       },
}

const Placeholder = ({ propertyType, caseNumber, className = '' }: {
  propertyType?: PropertyType
  caseNumber?: string
  className?: string
}) => {
  const meta = TYPE_META[propertyType ?? PropertyType.OTHER] ?? TYPE_META[PropertyType.OTHER]
  const Icon = meta.Icon
  return (
    <div className={`flex flex-col items-center justify-center ${meta.bg} ${className}`}>
      <Icon className={`w-10 h-10 mb-2 ${meta.color}`} />
      <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 tracking-wide">사진없음</span>
      <span className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">{meta.label}</span>
      {caseNumber && (
        <span className="mt-2 text-[9px] font-mono text-gray-300 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          {caseNumber}
        </span>
      )}
    </div>
  )
}

const PropertyImage = ({ src, alt, propertyType, caseNumber, className = '' }: PropertyImageProps) => {
  const [error, setError] = useState(false)

  if (!src || error) {
    return <Placeholder propertyType={propertyType} caseNumber={caseNumber} className={className} />
  }

  return (
    <img
      src={src}
      alt={alt ?? '물건 사진'}
      className={className}
      onError={() => setError(true)}
    />
  )
}

export default PropertyImage
