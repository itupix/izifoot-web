# Présences — Mon équipe

The Présences tab is available within the existing DIRECTION/COACH Mon équipe flow. It reads the globally selected team and defaults to the current club season. Season history is paginated through authenticated `GET /clubs/me/seasons?limit=200&offset=…`; reports use `GET /teams/:teamId/attendance-report?seasonId=…`.

The API contract is defined in backend `docs/features/team-attendance-report.md`. All percentages, totals, monthly boundaries and player/session statuses are server values. The UI does not derive presence from intent or recompute rates. Null rates render —. Present/(present+absent) is explained beside the summary; unrecorded observations are shown separately. Future/cancelled sessions and dates outside player eligibility are distinct textual statuses. Historical roster limitations follow the backend contract.

Par mois defaults to the current Paris month when available, otherwise the latest month containing training. Expanding a dated session shows each player's status. Par joueur supports name search and explicit selection, then season/month totals and dated statuses. Inactive players remain visible. Mobile uses stacked cards and rows rather than a horizontally scrolling matrix. Loading, retry, no team/season/training/player states are explicit. Team remount and request cleanup prevent old reports from appearing after team/season changes.

Validation: `npm test` (48 tests, including null/zero distinctions and Paris month boundaries). Production build succeeds after the separately documented baseline `scopeRevision` correction.

Manual checks: switch teams and seasons during slow requests; inspect a month with cancelled/future/unrecorded sessions; search/select an inactive player; verify ratios match backend; verify narrow viewport layout and error retry. Browser rendering still requires a live authenticated session.
