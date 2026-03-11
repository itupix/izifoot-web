# Test manuel - Attendance toggle (TRAINING / PLATEAU)

## Pré-requis
- Ouvrir une séance `TRAINING` et un `PLATEAU` avec au moins 1 joueur.
- Ouvrir DevTools > onglet Network, filtrer sur `attendance`.

## Cas 1: check
1. Cocher un joueur absent.
2. Vérifier un `POST /attendance` avec payload:
   - `session_type`: `TRAINING` ou `PLATEAU`
   - `session_id`: id de la séance
   - `playerId`: id joueur
   - `present: true`

## Cas 2: uncheck
1. Décocher un joueur présent.
2. Vérifier un `POST /attendance` avec payload:
   - `session_type`: `TRAINING` ou `PLATEAU`
   - `session_id`: id de la séance
   - `playerId`: id joueur
   - `present: false`

## Cas 3: refresh persistance
1. Après un check puis un uncheck, recharger la page (F5).
2. Vérifier que l'état de la checkbox correspond à la dernière action.
3. Refaire sur `TRAINING` puis sur `PLATEAU` (pas de régression inter-type).
