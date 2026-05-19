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
- Account invitation creation with shareable link/QR, coach assignment, resend, and coach deletion.

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
- Main flow: open club page -> edit club/team -> add or resend a coach invitation -> open the share sheet with the link and QR -> assign or remove coaches directly from a team card -> maintain the coach directory.
- Variants: delete team or coach after confirmation; reactivate a previously removed coach by reusing the same email.
- Back navigation: from coach detail to club list.
- Interruptions: validation errors on forms.
- Errors: backend 403/400/404 surfaced in toasts/messages.
- Edge cases: no teams and no invites.

## 7. Functional Behavior
- UI behavior: loads club, teams, and merged coach summaries, then renders every team as a management card.
- Actions: rename club, CRUD teams, add coach, resend coach invitation, delete coach, assign or unassign coach teams.
- States: loading, loaded, mutating, error.
- Conditions: route guard `DIRECTION` only.
- Validations: required fields for team and invite forms; coach assignment only accepts current-club teams.
- Blocking rules: destructive actions require explicit confirmation.
- Automations: none.

## 8. Data Model
- `ClubMe`, `Team`, `AccountInvitation`, account list objects.
Source: backend endpoints.
Purpose: render and mutate organization data.
Format: typed interfaces in `src/types/api.ts`.
Constraints: backend uniqueness and role rules.
- `ClubCoach.managedTeamIds` and `ClubCoach.managedTeams`
Source: `/clubs/me/coaches` and `/coaches/:id`.
Purpose: render cross-team coach associations and feed inline assignment actions.
Format: ordered id list plus denormalized team labels.
Constraints: kept in sync by `PUT /coaches/:id/teams`.

## 9. Business Rules
- Direction-only access enforced in route guards.
- Team creation requires name/category/format.
- Invitation creation requires target role and team mapping.
- Team cards are the primary entry point for coach assignment.
- Coach invitations can be reopened from the directory with the same share sheet pattern used elsewhere in staff flows.
- The global active-team picker is hidden on `/club` because club administration is cross-team.

## 10. State Machine
- Admin page states: `INIT` -> `LOADING` -> `READY` -> `MUTATING`.
- Team states: existing/edited/deleted.
- Invite states reflected from backend lifecycle.
- Invalid transitions: mutate without direction role.

## 11. UI Components
- Club name editor.
- Team cards/forms with coach chips and assignment controls.
- Coach directory table with resend/delete actions.
- Account invite form.
- Coach detail page.

## 12. Routes / API / Handlers
- Front routes: `/club`, `/club/coach/:id`.
- API: `/clubs/me`, `/clubs/me/coaches`, `/coaches/:id`, `/coaches/:id/teams`, `/teams`, `/teams/:id`, `/accounts`.

## 13. Persistence
- Client: local component state for forms and fetched lists.
- Backend: club/team/account invite tables.

## 14. Dependencies
- Upstream: auth + role guard + team scope.
- Downstream: training/player/messaging depend on team setup.
- Cross-repo: iOS club feature mirrors core behavior with the same coach contract.

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
- Product: define coach-management lifecycle wording in product copy now that removal keeps historical data.
- UX: keep coach assignment closest to team cards and avoid reintroducing a conflicting active-team picker on this route.
- Tech: split component into domain submodules.
- Security: add client-side confirmation for high-impact deletions.

## 20. Acceptance Criteria
1. Direction can rename club and manage teams.
2. Direction can assign and remove coaches directly from each team card.
3. Direction can add and remove coaches from the club directory.
4. Non-direction cannot access admin routes.
5. API errors are surfaced with actionable message.

## 21. Test Scenarios
- Happy path: create team, invite coach, assign the same coach to another team, then remove one assignment.
- Permissions: coach trying `/club` is denied.
- Errors: duplicate team name response handling.
- Edge cases: deleting last team; removing the last team from a coach; deleting a pending coach invite.

## 22. Technical References
- `src/pages/ClubManagementPage.tsx`
- `src/pages/ClubCoachDetailsPage.tsx`
- `src/apiRoutes.ts`
