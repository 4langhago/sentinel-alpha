export interface AuctionItem {
  id: string
  caseNumber: string
  court: string
  address: string
  propertyType: PropertyType
  area: number
  minimumBid: number
  appraisalValue: number
  auctionDate: string
  description: string
  images?: string[]
  status: AuctionStatus
}

export enum PropertyType {
  APARTMENT = 'APARTMENT',
  HOUSE = 'HOUSE',
  COMMERCIAL = 'COMMERCIAL',
  LAND = 'LAND',
  OFFICE = 'OFFICE',
  OTHER = 'OTHER'
}

export enum AuctionStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface SearchFilters {
  propertyTypes: PropertyType[]
  minInvestment: number
  maxInvestment: number
  courts: string[]
  address: string
  status: AuctionStatus[]
}
