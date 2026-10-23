import { describe, expect, it } from 'vitest'
import { materialsStatus, type TrainingMaterialsResponse } from './trainingMaterials'

const base: TrainingMaterialsResponse = { items: [], drillCount: 2, missingDiagramCount: 0 }
describe('training materials availability', () => {
  it('distinguishes no selection from exercises without equipment', () => {
    expect(materialsStatus({ ...base, drillCount: 0 })).toContain('Ajoutez des exercices')
    expect(materialsStatus(base)).toContain('Aucun matériel indiqué')
  })
  it('never presents missing diagrams as an equipment-free session', () => {
    expect(materialsStatus({ ...base, missingDiagramCount: 1 })).toContain('Liste partielle')
    expect(materialsStatus({ ...base, missingDiagramCount: 2 })).toContain('Matériel indisponible')
  })
  it('keeps complete supplied lists free of warnings', () => {
    expect(materialsStatus({ ...base, items: [{ type: 'bib', label: 'Chasubles', quantity: null }] })).toBeNull()
  })
})
