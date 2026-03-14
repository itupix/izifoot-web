const enc = encodeURIComponent

export const apiRoutes = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    invitationByToken: (token: string) => `/auth/invitations/${enc(token)}`,
    acceptInvitation: '/auth/invitations/accept',
  },
  me: '/me',
  clubs: {
    me: '/clubs/me',
  },
  teams: {
    list: '/teams',
    byId: (id: string) => `/teams/${enc(id)}`,
  },
  accounts: {
    list: '/accounts',
    invitations: '/accounts/invitations',
  },
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
    roles: (trainingId: string) => `/trainings/${enc(trainingId)}/roles`,
    generateAiDrills: (trainingId: string) => `/trainings/${enc(trainingId)}/drills/generate-ai`,
    drillById: (trainingId: string, trainingDrillId: string) =>
      `/trainings/${enc(trainingId)}/drills/${enc(trainingDrillId)}`,
  },
  plateaus: {
    list: '/plateaus',
    byId: (id: string) => `/plateaus/${enc(id)}`,
    share: (id: string) => `/plateaus/${enc(id)}/share`,
    summary: (id: string) => `/plateaus/${enc(id)}/summary`,
  },
  public: {
    plateauByToken: (token: string) => `/public/plateaus/${enc(token)}`,
  },
  drills: {
    list: '/drills',
    byId: (id: string) => `/drills/${enc(id)}`,
    diagrams: (drillId: string) => `/drills/${enc(drillId)}/diagrams`,
    generateAiDiagram: (drillId: string) => `/drills/${enc(drillId)}/diagrams/generate-ai`,
  },
  trainingDrills: {
    diagrams: (trainingDrillId: string) => `/training-drills/${enc(trainingDrillId)}/diagrams`,
    generateAiDiagram: (trainingDrillId: string) => `/training-drills/${enc(trainingDrillId)}/diagrams/generate-ai`,
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
