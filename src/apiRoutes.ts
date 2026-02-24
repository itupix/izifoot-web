const enc = encodeURIComponent

export const apiRoutes = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
  },
  me: '/me',
  plannings: {
    list: '/plannings',
    byId: (id: string) => `/plannings/${enc(id)}`,
    share: (id: string) => `/plannings/${enc(id)}/share`,
  },
  players: {
    list: '/players',
    byId: (id: string) => `/players/${enc(id)}`,
    invite: (id: string) => `/players/${enc(id)}/invite`,
  },
  trainings: {
    list: '/trainings',
    byId: (id: string) => `/trainings/${enc(id)}`,
    drills: (trainingId: string) => `/trainings/${enc(trainingId)}/drills`,
    drillById: (trainingId: string, trainingDrillId: string) =>
      `/trainings/${enc(trainingId)}/drills/${enc(trainingDrillId)}`,
  },
  plateaus: {
    list: '/plateaus',
    byId: (id: string) => `/plateaus/${enc(id)}`,
    summary: (id: string) => `/plateaus/${enc(id)}/summary`,
  },
  drills: {
    list: '/drills',
    diagrams: (drillId: string) => `/drills/${enc(drillId)}/diagrams`,
  },
  trainingDrills: {
    diagrams: (trainingDrillId: string) => `/training-drills/${enc(trainingDrillId)}/diagrams`,
  },
  diagrams: {
    byId: (id: string) => `/diagrams/${enc(id)}`,
  },
  matches: {
    list: '/matches',
    byId: (id: string) => `/matches/${enc(id)}`,
    byPlateau: (plateauId: string) => `/matches?plateauId=${enc(plateauId)}`,
  },
  attendance: {
    list: '/attendance',
    bySession: (sessionType: 'TRAINING' | 'PLATEAU', sessionId: string) =>
      `/attendance?session_type=${sessionType}&session_id=${enc(sessionId)}`,
  },
} as const
