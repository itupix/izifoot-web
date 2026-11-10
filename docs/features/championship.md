# Championnat

L’onglet Championnat suit Planning et reste visible pour tous les rôles. GET /championship?teamId= sélectionne le championnat de l’équipe active ; canManage fourni par le serveur contrôle les actions.

Le staff saisit un nom et les adversaires (une équipe par ligne), son équipe étant incluse automatiquement. L’aller-retour est coché par défaut. POST /championship génère le brouillon ; les participants restent figés en v1. Le calendrier présente journées et repos. Les horaires locaux sont envoyés en ISO avec fuseau via PATCH /championship/:id/fixtures/:fixtureId. Un horaire vide devient null.

Les matchs sans horaire sont déplaçables par glisser-déposer ou Monter/Descendre. PUT /championship/:id/order transmet toutes les rencontres, en conservant les positions des matchs datés et les journées. Les mutations incluent revision et utilisent exclusivement l’enveloppe renvoyée par le serveur. En cas de conflit, recharger avant de réessayer.

POST /championship/:id/validate accepte les horaires manquants. Après validation, le planning affiche uniquement les rencontres de l’équipe active : dans le jour local pour les matchs datés, et sous À programmer pour les autres, sans date artificielle. Les liens ouvrent le championnat.

Les résultats sont saisis après validation (deux entiers positifs ou nuls, ou deux champs vides pour effacer) via PUT /championship/:id/fixtures/:fixtureId/result. Le classement indicatif est fourni par le serveur, sans recalcul client : 3/1/0 points puis différence, buts marqués et nom. Les lecteurs consultent calendrier et classement sans commandes de modification.

Vérification : build TypeScript/Vite et tests Vitest ; tests dédiés au maintien des positions datées pendant le réordonnancement.

Le planning affiche les rencontres après l’en-tête du jour. Les scores restent limités à 999 et les champs se réinitialisent depuis la réponse serveur à chaque révision. Le badge À programmer apparaît aussi pour les gestionnaires. Sur mobile, le classement conserve visibles position, équipe, matchs joués et points, y compris pour un nom très long sans espaces.

Les jours contenant une rencontre datée de championnat portent le même indicateur de compétition que les autres événements dans le calendrier mensuel. Les dates sont rechargées à chaque ouverture du planning et changement d’équipe ; revenir de Championnat recharge donc les horaires et validations enregistrés.

## Team scope refresh

Championship screens and planning refresh on selected team changes. Removed obsolete `scopeRevision` references because the team scope provider exposes no revision field; this restores the production TypeScript build without changing API or team selection behavior.
