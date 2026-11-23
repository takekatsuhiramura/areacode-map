export type Kind = 'full' | 'most' | 'part'

export interface AreaMuni {
  code: string
  pref: string
  name: string
  kind: Kind
}

export interface Area {
  id: string
  name: string
  areaCode: string
  exchange: string
  color: number
  munis: AreaMuni[]
  exchanges?: string[]
  description: string
}

export interface AreaData {
  meta: { title: string; updated: string; boundaries: string; generatedBy: string }
  areas: Area[]
}
