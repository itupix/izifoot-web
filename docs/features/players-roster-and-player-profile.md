# Players Roster And Player Profile

## 1. Summary
- Clear description: Player list management, player profile editing, invitation handling, and performance-related aggregates.
- User problem solved: Staff can maintain roster and inspect player participation context.
- Product value: Core operational dataset for trainings and matchdays.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: Team management requires detailed player records and onboarding actions.
- Target users: admin/coach.
- Context of use: `/effectif` and `/effectif/:id`.
- Expected outcome: accurate player profiles and invitation status visibility.

## 3. Scope
Included
- `PlayersPage.tsx` and `PlayerDetailsPage.tsx`.
- Player CRUD and list pagination.
- Parent/player invitation and parent unlink flows.

Excluded
- Player portal endpoints usage outside staff views.

## 4. Actors
- Admin
Permissions: full roster operations.
Actions: CRUD + invitations.
Restrictions: scoped.
- Coach
Permissions: same in managed teams.
Actions: same.
Restrictions: no unmanaged writes.
- Parent
Permissions: no access to roster pages.
Actions: none.
Restrictions: blocked.
- Player
Permissions: no access to roster pages.
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
Permissions: merges player with attendance/match/training context in detail.
Actions: computes profile stats and invitation display.
Restrictions: depends on multiple endpoints.

## 5. Entry Points
- UI: `/effectif`, `/effectif/:id`.
- API: players endpoints, invitation status, invite QR, attendance/matches/trainings aggregates.

## 6. User Flows
- Main flow: open roster -> create/select player -> edit profile.
- Variants: send invitation or unlink parent contact.
- Back navigation: player detail to list.
- Interruptions: invite errors.
- Errors: invalid payload or forbidden scope.
- Edge cases: legacy field names in payload.

## 7. Functional Behavior
- UI behavior: paginated list and detail with multiple data fetches.
- Actions: create/update/delete player, invite, unlink parent.
- States: loading, saving, deleting, invite pending.
- Conditions: role guard for direction/coach.
- Validations: required profile fields and contact format constraints.
- Blocking rules: destructive actions require confirmation.
- Automations: QR generation endpoint consumed for invite display.

## 8. Data Model
- `Player` interface with legacy aliases.
Source: backend payloads.
Purpose: resilient rendering despite naming variants.
Format: mixed camelCase/snake_case fields.
Constraints: normalized in adapters/components.

## 9. Business Rules
- Player detail fetch includes invitation status endpoint.
- Parent unlink triggers data refresh.
- Invite response may include URL and QR usage.

## 10. State Machine
- Player states: created/updated/deleted.
- Invite states: none/pending/accepted/cancelled/expired.
- Page states: loading/ready/error.
- Invalid transitions: editing deleted player.

## 11. UI Components
- Player list cards/table.
- Player profile form.
- Invite modal and QR display.
- Parent contact section.

## 12. Routes / API / Handlers
- Front routes: `/effectif`, `/effectif/:id`.
- API: `/players*`, `/players/:id/invitation-status`, `/players/:id/invite`, `/players/:id/invite/qr`, `/players/:id/parents/:parentId`.

## 13. Persistence
- Client: local state for selected player and profile edits.
- Backend: player/invite/attendance/match relations.

## 14. Dependencies
- Upstream: club/team scope and auth.
- Downstream: training/matchday modules consume player data.
- Cross-repo: iOS players feature parity target.

## 15. Error Handling
- Validation: field-level errors and API errors.
- Network: safe fallback for supplementary stats requests.
- Missing data: unknown player displays error state.
- Permissions: backend forbidden.
- Current vs expected: mixed naming adds error-prone mapping.

## 16. Security
- Access control: route guard + backend checks.
- Data exposure: staff-only routes.
- Guest rules: blocked.

## 17. UX Requirements
- Feedback: save/delete/invite confirmations.
- Empty states: no players in selected team.
- Loading: independent loaders for detail subrequests.
- Responsive: profile form sections stack on mobile.

## 18. Ambiguities & Gaps
- Observed
- Multiple field aliases (`firstName`, `first_name`, `prenom`) are handled.
- Inferred
- Backward compatibility constraints still active.
- Missing
- Canonical field naming deprecation plan.
- Tech debt
- High adapter complexity in types and detail page logic.

## 19. Recommendations
- Product: define final player profile field contract.
- UX: show invite timeline with timestamps.
- Tech: central normalization utility for player payload.
- Security: enforce redaction rules for parent contacts where needed.

## 20. Acceptance Criteria
1. Direction/coach can CRUD players.
2. Invitation status and invite action work from detail page.
3. Parent unlink updates displayed data.
4. Unauthorized roles cannot access roster pages.

## 21. Test Scenarios
- Happy path: create player and send invite.
- Permissions: parent denied route.
- Errors: delete player with backend constraint failure.
- Edge cases: payload only containing legacy field keys.

## 22. Technical References
- `src/pages/PlayersPage.tsx`
- `src/pages/PlayerDetailsPage.tsx`
- `src/types/api.ts`
