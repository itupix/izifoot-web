# Matchday And Match Detail Operations

## 1. Summary
- Clear description: Covers matchday detail management and match detail event/scoring workflows.
- User problem solved: Coaches need live and pre-live control of matchday structure.
- Product value: Central gameplay execution interface.
- Repository: `izifoot-web`.
- Status: existing (complex and partially legacy-compatible).

## 2. Product Objective
- Why it exists: Matchday requires high-density interactions on players, matches, events, and sharing.
- Target users: admin/coach (full), parent/player (limited read on some routes).
- Context of use: `/matchday/:id`, `/match/:id`, legacy `/match-day/:id` and `MatchDay.tsx`.
- Expected outcome: accurate matchday summaries and match event history.

## 3. Scope
Included
- `PlateauDetailsPage.tsx` and `MatchDetailsPage.tsx`.
- Matchday metadata edits, attendance toggles, sharing, team absences.
- Match CRUD and score/event updates.

Excluded
- Public matchday page (separate feature).

## 4. Actors
- Admin
Permissions: full operations.
Actions: all matchday and match mutations.
Restrictions: scoped.
- Coach
Permissions: full scoped operations.
Actions: same within managed team.
Restrictions: no out-of-scope writes.
- Parent
Permissions: mostly read-only.
Actions: consume selected summary data.
Restrictions: no structural mutation.
- Player
Permissions: mostly read-only.
Actions: consume selected summary data.
Restrictions: no structural mutation.
- Guest
Permissions: none on protected routes.
Actions: none.
Restrictions: blocked.
- Unauthenticated user
Permissions: none on these routes.
Actions: none.
Restrictions: redirected.
- System
Permissions: normalizes summary and match payloads.
Actions: syncs dependent state after mutations.
Restrictions: depends on backend contract stability.

## 5. Entry Points
- UI: `/matchday/:id`, `/match/:id`, `/match-day/:id`.
- API: matchday, matches, attendance, summary, share, events endpoints.

## 6. User Flows
- Main flow: open matchday -> adjust attendance/matches -> open match detail -> manage events.
- Variants: auto-generate matches or manual creation.
- Back navigation: return from match detail to matchday.
- Interruptions: summary mismatch after concurrent updates.
- Errors: event save failure, scope errors.
- Edge cases: remove all matches and rebuild schedule.

## 7. Functional Behavior
- UI behavior: combines many data sources and mutation paths.
- Actions: edit matchday metadata, share link, mutate matches, manage scorers/events.
- States: loading, save in progress, conflict/error states.
- Conditions: role and scope checks in backend.
- Validations: payload shaping before PUT/POST.
- Blocking rules: mutation buttons disabled while requests pending.
- Automations: summary refresh after key operations.

## 8. Data Model
- `Matchday`, `MatchLite`, match detail response, `AttendanceRow`.
Source: multiple API endpoints.
Purpose: orchestrate roster and match progression.
Format: typed plus normalization helpers.
Constraints: backend scope and enum constraints.

## 9. Business Rules
- Matchday summary drives lineup and convocations context.
- Match events update score/timeline state.
- Share action generates tokenized public URL.

## 10. State Machine
- Matchday states: editable, shared, deleted.
- Match states: planned, played, cancelled.
- Event states: add/delete event entries.
- Invalid transitions: event updates on deleted match.

## 11. UI Components
- Matchday detail page sections.
- Match editor forms/modals.
- Match detail timeline and score controls.
- Share link panel.

## 12. Routes / API / Handlers
- Front routes: `/matchday/:id`, `/match/:id`, `/match-day/:id`.
- API: `/matchday*`, `/matches*`, `/matches/:id/events`, `/attendance`.

## 13. Persistence
- Client: local caches for summary/match lists.
- Backend: plateau, match, event, attendance models.

## 14. Dependencies
- Upstream: planning list and player roster.
- Downstream: stats and public matchday outputs.
- Cross-repo: iOS matchday detail mirrors many operations.

## 15. Error Handling
- Validation: malformed match/event payload.
- Network: request failures handled with local error state.
- Missing data: missing matchday/match redirect or error.
- Permissions: backend forbidden responses.
- Current vs expected: complex page has heterogeneous error UX.

## 16. Security
- Access control: authenticated routes + backend scope checks.
- Data exposure: only scoped data loaded.
- Guest rules: no access.

## 17. UX Requirements
- Feedback: immediate save/error feedback on scores/events.
- Empty states: no matches configured.
- Loading: progressive data load with refresh.
- Responsive: complex layouts remain navigable on mobile.

## 18. Ambiguities & Gaps
- Observed
- Legacy `MatchDay.tsx` route exists alongside current pages.
- Inferred
- Ongoing migration between old and new matchday UIs.
- Missing
- Single canonical matchday page strategy document.
- Tech debt
- Very large components with multi-domain responsibilities.

## 19. Recommendations
- Product: decide canonical matchday UI and deprecate legacy route.
- UX: unify event editing affordances across contexts.
- Tech: factor shared hooks for summary/match sync.
- Security: enforce anti-duplicate event submission strategy.

## 20. Acceptance Criteria
1. User can manage matchday metadata, attendance, and matches.
2. Match detail supports event create/delete and score updates.
3. Share link action returns usable URL.
4. Out-of-scope operations fail safely.

## 21. Test Scenarios
- Happy path: create match in matchday and edit events.
- Permissions: non-coach/direction cannot mutate.
- Errors: event endpoint failure while keeping UI stable.
- Edge cases: delete all matches then recreate.

## 22. Technical References
- `src/pages/PlateauDetailsPage.tsx`
- `src/pages/MatchDetailsPage.tsx`
- `src/pages/MatchDay.tsx`
- `src/apiRoutes.ts`
