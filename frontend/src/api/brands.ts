// Brand (manufacturer) data access.

import type { Brand } from '@/types'
import { getAll, getItem } from './client'

export function fetchBrands(): Promise<Brand[]> {
  return getAll<Brand>('brand')
}

export function fetchBrand(id: number | string): Promise<Brand> {
  return getItem<Brand>('brand', id)
}
