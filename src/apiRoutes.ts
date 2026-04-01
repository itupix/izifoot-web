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
  meProfile: '/me/profile',
  meChild: '/me/child',
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
    parentById: (id: string, parentId: string) => `/players/${enc(id)}/parents/${enc(parentId)}`,
    invite: (id: string) => `/players/${enc(id)}/invite`,
    inviteQr: (id: string) => `/players/${enc(id)}/invite/qr`,
    invitationStatus: (id: string) => `/players/${enc(id)}/invitation-status`,
  },
  trainings: {
    list: '/trainings',
    byId: (id: string) => `/trainings/${enc(id)}`,
    intent: (id: string) => `/trainings/${enc(id)}/intent`,
    drills: (trainingId: string) => `/trainings/${enc(trainingId)}/drills`,
    roles: (trainingId: string) => `/trainings/${enc(trainingId)}/roles`,
    generateAiDrills: (trainingId: string) => `/trainings/${enc(trainingId)}/drills/generate-ai`,
    drillById: (trainingId: string, trainingDrillId: string) =>
      `/trainings/${enc(trainingId)}/drills/${enc(trainingDrillId)}`,
  },
  matchday: {
    list: '/matchday',
    byId: (id: string) => `/matchday/${enc(id)}`,
    share: (id: string) => `/matchday/${enc(id)}/share`,
    summary: (id: string) => `/matchday/${enc(id)}/summary`,
    teamsAbsence: (id: string) => `/matchday/${enc(id)}/teams/absence`,
  },
  public: {
    matchdayByToken: (token: string) => `/public/matchday/${enc(token)}`,
  },
  player: {
    matchday: '/player/matchday',
    summary: (id: string) => `/player/matchday/${enc(id)}/summary`,
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
    byMatchday: (matchdayId: string) => `/matches?matchdayId=${enc(matchdayId)}`,
  },
  attendance: {
    list: '/attendance',
    bySession: (sessionType: 'TRAINING' | 'PLATEAU', sessionId: string) =>
      `/attendance?session_type=${sessionType}&session_id=${enc(sessionId)}`,
  },
  teamMessages: {
    list: '/team-messages',
    unreadCount: '/team-messages/unread-count',
    like: (id: string) => `/team-messages/${enc(id)}/reactions/like`,
  },
} as const
