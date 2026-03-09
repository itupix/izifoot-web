import { describe, expect, it } from 'vitest'
import { HttpError } from '../api'
import { mapTrainingAiError, setLoadingById } from './trainingAi'

describe('mapTrainingAiError', () => {
  it('maps known HTTP status codes for training generation', () => {
    expect(mapTrainingAiError(new HttpError(400, 'bad'), 'training')).toContain('10 et 400')
    expect(mapTrainingAiError(new HttpError(401, 'bad'), 'training')).toContain('Session expiree')
    expect(mapTrainingAiError(new HttpError(403, 'bad'), 'training')).toContain('COACH ou DIRECTION')
    expect(mapTrainingAiError(new HttpError(404, 'bad'), 'training')).toContain('Seance ou equipe')
    expect(mapTrainingAiError(new HttpError(502, 'bad'), 'training')).toContain('format de reponse invalide')
    expect(mapTrainingAiError(new HttpError(503, 'bad'), 'training')).toContain('Service IA indisponible')
    expect(mapTrainingAiError(new HttpError(504, 'bad'), 'training')).toContain('timeout')
  })

  it('maps 400 and 404 specifically for diagram generation', () => {
    expect(mapTrainingAiError(new HttpError(400, 'bad'), 'diagram')).toContain('diagramme')
    expect(mapTrainingAiError(new HttpError(404, 'bad'), 'diagram')).toContain('Exercice introuvable')
  })
})

describe('setLoadingById', () => {
  it('adds a loading key when request starts', () => {
    expect(setLoadingById({}, 'td_1', true)).toEqual({ td_1: true })
  })

  it('removes only the target key when request ends', () => {
    expect(setLoadingById({ td_1: true, td_2: true }, 'td_1', false)).toEqual({ td_2: true })
  })
})
