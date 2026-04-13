# Club Management And Account Administration

## 1. Summary
- Clear description: UI for club profile, teams CRUD, account invitation management, and coach details.
- User problem solved: Direction users can configure organization and onboard staff.
- Product value: Establishes operating structure for all other workflows.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: Club setup is mandatory before planning and roster workflows.
- Target users: direction role.
- Context of use: `/club` and `/club/coach/:id`.
- Expected outcome: correctly configured club/team/account structure.

## 3. Scope
Included
- `ClubManagementPage.tsx` and `ClubCoachDetailsPage.tsx`.
- Club rename, team create/update/delete.
- Account invitation listing and creation.

Excluded
- Invitation acceptance endpoint flow (auth feature).

## 4. Actors
- Admin
Permissions: full access.
Actions: all mutations and reads.
Restrictions: own club only.
- Coach
Permissions: no page access by route guard.
Actions: none.
Restrictions: blocked.
- Parent
Permissions: none.
Actions: none.
Restrictions: blocked.
- Player
Permissions: none.
Actions: none.
Restrictions: blocked.
- Guest
Permissions: none.
Actions: none.
Restrictions: blocked.
- Unauthenticated user
Permissions: none.
Actions: none.
Restrictions: redirected.
- System
Permissions: loads club/teams/invitations/accounts in parallel.
Actions: displays current administrative state.
Restrictions: depends on backend scope checks.

## 5. Entry Points
- UI: `/club`, `/club/coach/:id`.
- API: `clubs.me`, `teams.*`, `accounts.*`.

## 6. User Flows
- Main flow: open club page -> edit club/team -> invite account.
- Variants: delete team after confirmation.
- Back navigation: from coach detail to club list.
- Interruptions: validation errors on forms.
- Errors: backend 403/400/404 surfaced in toasts/messages.
- Edge cases: no teams and no invites.

## 7. Functional Behavior
- UI behavior: loads multiple resources and merges into one admin screen.
- Actions: optimistic/pessimistic mutations depending on operation.
- States: loading, loaded, mutating, error.
- Conditions: route guard `DIRECTION` only.
- Validations: required fields for team and invite forms.
- Blocking rules: destructive actions require explicit confirmation.
- Automations: none.

## 8. Data Model
- `ClubMe`, `Team`, `AccountInvitation`, account list objects.
Source: backend endpoints.
Purpose: render and mutate organization data.
Format: typed interfaces in `src/types/api.ts`.
Constraints: backend uniqueness and role rules.

## 9. Business Rules
- Direction-only access enforced in route guards.
- Team creation requires name/category/format.
- Invitation creation requires target role and team mapping.

## 10. State Machine
- Admin page states: `INIT` -> `LOADING` -> `READY` -> `MUTATING`.
- Team states: existing/edited/deleted.
- Invite states reflected from backend lifecycle.
- Invalid transitions: mutate without direction role.

## 11. UI Components
- Club name editor.
- Team list/forms.
- Account invite form and invitation list.
- Coach detail page.

## 12. Routes / API / Handlers
- Front routes: `/club`, `/club/coach/:id`.
- API: `/clubs/me`, `/teams`, `/teams/:id`, `/accounts`, `/accounts/invitations`.

## 13. Persistence
- Client: local component state for forms and fetched lists.
- Backend: club/team/account invite tables.

## 14. Dependencies
- Upstream: auth + role guard + team scope.
- Downstream: training/player/messaging depend on team setup.
- Cross-repo: iOS club feature mirrors core behavior.

## 15. Error Handling
- Validation: frontend pre-check + backend error response.
- Network: show recoverable error with retry.
- Missing data: null-safe loading fallbacks.
- Permissions: guard redirect and backend 403.
- Current vs expected: no shared error component for admin pages.

## 16. Security
- Access control: `RequireRole(['DIRECTION'])`.
- Data exposure: admin data hidden from non-direction roles.
- Guest rules: no route access.

## 17. UX Requirements
- Feedback: show mutation success/failure clearly.
- Empty states: explicit “no team/no invite” views.
- Loading: skeleton/spinner while multi-fetch runs.
- Responsive: forms usable on mobile widths.

## 18. Ambiguities & Gaps
- Observed
- Page combines many responsibilities in one component.
- Inferred
- Admin workflow still evolving with additional roles.
- Missing
- No bulk invite operation.
- Tech debt
- Large component complexity increases regression risk.

## 19. Recommendations
- Product: define coach-management lifecycle (activate/deactivate).
- UX: separate team management and account invitation tabs.
- Tech: split component into domain submodules.
- Security: add client-side confirmation for high-impact deletions.

## 20. Acceptance Criteria
1. Direction can rename club and manage teams.
2. Direction can create account invitations.
3. Non-direction cannot access admin routes.
4. API errors are surfaced with actionable message.

## 21. Test Scenarios
- Happy path: create team and invite coach.
- Permissions: coach trying `/club` is denied.
- Errors: duplicate team name response handling.
- Edge cases: deleting last team.

## 22. Technical References
- `src/pages/ClubManagementPage.tsx`
- `src/pages/ClubCoachDetailsPage.tsx`
- `src/apiRoutes.ts`
