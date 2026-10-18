import { apiPut } from '../apiClient'
import { apiRoutes } from '../apiRoutes'
import type { Drill } from '../types/api'

export async function updateDrillDetails(
  drillId: string,
  { title, category, description }: Pick<Drill, 'title' | 'category' | 'description'>,
): Promise<Drill> {
  return apiPut<Drill>(apiRoutes.drills.byId(drillId), { title, category, description })
}
