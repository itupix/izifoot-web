# Planning Home And Session Creation

## 1. Summary
- Clear description: Unified planning timeline listing trainings and matchdays with creation actions.
- User problem solved: Users need one entry point for upcoming activities.
- Product value: Operational hub for daily coaching workflow.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: Reduce scheduling friction and centralize navigation to detail pages.
- Target users: all authenticated roles (write mostly direction/coach).
- Context of use: `/planning` route.
- Expected outcome: visible schedule, quick creation, and role-aware interactions.

## 3. Scope
Included
- `TrainingsPage.tsx` list loading and pagination for trainings/matchdays.
- Create training and create matchday actions.
- Intent submission action for parent/player roles.

Excluded
- Detailed editing handled in detail pages.

## 4. Actors
- Admin
Permissions: create and view all scoped sessions.
Actions: create training/matchday.
Restrictions: scope-bound.
- Coach
Permissions: same as admin in managed team.
Actions: create sessions.
Restrictions: no out-of-scope create.
- Parent
Permissions: read sessions and set training intent.
Actions: submit presence intent.
Restrictions: no create/delete sessions.
- Player
Permissions: read sessions and set training intent.
Actions: submit intent.
Restrictions: no create/delete sessions.
- Guest
Permissions: none.
Actions: none.
Restrictions: blocked.
- Unauthenticated user
Permissions: none.
Actions: none.
Restrictions: redirected.
- System
Permissions: merges paginated results and normalizes payloads.
Actions: provides combined schedule list.
Restrictions: dependent on API contract.

## 5. Entry Points
- UI: `/planning` page.
- API: `/trainings`, `/matchday`, `/trainings/:id/intent`.

## 6. User Flows
- Main flow: open planning -> view upcoming items -> open detail.
- Variants: create training or matchday from page actions.
- Back navigation: from detail pages back to timeline.
- Interruptions: pagination load failures.
- Errors: create failure and intent failure states.
- Edge cases: mixed-role account with restricted writes.

## 7. Functional Behavior
- UI behavior: two paginated feeds combined by date/time context.
- Actions: create sessions and submit intent.
- States: loading, partial loading more, empty, error.
- Conditions: creation actions hidden/disabled for read-only roles.
- Validations: date/time and location fields before creation.
- Blocking rules: backend forbids unauthorized writes.
- Automations: none.

## 8. Data Model
- `Training` and `Matchday` interfaces.
Source: paginated API responses.
Purpose: timeline rendering and navigation payload.
Format: typed objects with date/status/team context.
Constraints: normalized from variant backend formats.

## 9. Business Rules
- Role controls available creation/intents actions.
- Intent action only valid for training items.
- Team scope affects visible sessions.

## 10. State Machine
- Page states: `LOADING` -> `READY` / `ERROR`.
- Pagination states: `HAS_MORE`/`END`.
- Intent states: `UNSET` -> `PRESENT/ABSENT`.
- Invalid transitions: submit intent on inaccessible training.

## 11. UI Components
- Timeline/list cards.
- Creation modals/forms.
- Intent toggle controls.

## 12. Routes / API / Handlers
- Front route: `/planning`.
- API: trainings list/create, matchday list/create, training intent post.

## 13. Persistence
- Client: in-memory list state with pagination offsets.
- Backend: training/matchday tables.

## 14. Dependencies
- Upstream: app shell scope context.
- Downstream: training and matchday detail pages.
- Cross-repo: mirrors iOS planning home behavior.

## 15. Error Handling
- Validation: client pre-validation for creation forms.
- Network: retry prompts on list and create failures.
- Missing data: fallback defaults for optional fields.
- Permissions: backend 403 surfaced.
- Current vs expected: limited granular error typing.

## 16. Security
- Access control: route requires auth.
- Data exposure: only scoped planning items loaded.
- Guest rules: no access.

## 17. UX Requirements
- Feedback: creation success and failure messages.
- Empty states: no upcoming sessions.
- Loading: separate indicators for initial load and load-more.
- Responsive: cards and forms should remain usable on mobile.

## 18. Ambiguities & Gaps
- Observed
- Multiple list endpoints require adapter normalization.
- Inferred
- Backend pagination contract evolved over time.
- Missing
- Unified sorting/merging contract between trainings and matchdays.
- Tech debt
- Data normalization logic spread across page and adapters.

## 19. Recommendations
- Product: define consistent ordering rules for combined timeline.
- UX: add filter chips (training/matchday/status).
- Tech: centralize planning feed adapter.
- Security: log forbidden mutation attempts for diagnostics.

## 20. Acceptance Criteria
1. Authenticated user can view scoped planning timeline.
2. Coach/direction can create training and matchday.
3. Parent/player can submit training intent only.
4. Pagination works without duplicate items.

## 21. Test Scenarios
- Happy path: create matchday and open detail.
- Permissions: parent cannot create training.
- Errors: API failure during load-more.
- Edge cases: empty timeline with no teams.

## 22. Technical References
- `src/pages/TrainingsPage.tsx`
- `src/adapters/pagination.ts`
- `src/apiRoutes.ts`
