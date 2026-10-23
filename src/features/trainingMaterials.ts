export type TrainingMaterialsResponse = {
  items: Array<{
    type: 'cup' | 'cone' | 'ball' | 'post' | 'bib'
    label: string
    quantity: number | null
  }>
  drillCount: number
  missingDiagramCount: number
}

export function materialsStatus(materials: TrainingMaterialsResponse): string | null {
  if (materials.drillCount === 0) return 'Ajoutez des exercices pour connaître le matériel nécessaire.'
  if (materials.missingDiagramCount === materials.drillCount) {
    return 'Matériel indisponible : les exercices sélectionnés ne disposent pas de schéma exploitable.'
  }
  if (materials.missingDiagramCount > 0) {
    return 'Liste partielle : certains exercices ne disposent pas de schéma exploitable.'
  }
  if (materials.items.length === 0) return 'Aucun matériel indiqué pour les exercices sélectionnés.'
  return null
}
