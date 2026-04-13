# App Shell Navigation And Team Scope

## 1. Summary
- Clear description: Defines global layout, navigation menu, role-based route access, and active team selector.
- User problem solved: Users need coherent navigation and team context switching.
- Product value: Prevents feature misuse and keeps data context explicit.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: App-wide shell coordinates permissions, unread badges, and scope state.
- Target users: all authenticated roles.
- Context of use: every protected route.
- Expected outcome: only allowed pages visible, team scope consistently applied.

## 3. Scope
Included
- `App.tsx` route map and sidebar shell.
- `RequireAuth` and `RequireRole` guards.
- `useTeamScope` integration and team selector.
- Message unread counter polling in shell.

Excluded
- Per-page feature-specific business logic.

## 4. Actors
- Admin
Permissions: full nav including club, drills, roster, stats.
Actions: switch active team and navigate all admin areas.
Restrictions: none beyond backend scope.
- Coach
Permissions: planning/messages/account/drills/roster/stats.
Actions: switch managed team.
Restrictions: no club management route.
- Parent
Permissions: planning/messages/account.
Actions: consume child-related schedule and communication.
Restrictions: no drills/roster/stats admin pages.
- Player
Permissions: planning/messages/account.
Actions: consume own context.
Restrictions: no admin/coach pages.
- Guest
Permissions: public routes only.
Actions: none in shell.
Restrictions: no sidebar shell.
- Unauthenticated user
Permissions: same as guest.
Actions: home only.
Restrictions: no protected routes.
- System
Permissions: computes fallback routes by role.
Actions: redirects and updates unread counts.
Restrictions: depends on auth/team hooks.

## 5. Entry Points
- UI: sidebar menu, top header, team select dropdown.
- Routes: all `App.tsx` route declarations.
- API triggers: unread-count polling endpoint.

## 6. User Flows
- Main flow: login -> shell loads -> user navigates allowed pages.
- Variants: direction forced to `/club` when team setup required.
- Back navigation: standard browser navigation in route tree.
- Interruptions: unread count API failure falls back to 0.
- Errors: unauthorized route redirects.
- Edge cases: no available teams for scoped roles.

## 7. Functional Behavior
- UI behavior: menu opens/closes, highlights active route.
- Actions: logout, team switch, nav transitions.
- States: menu open/closed, team loading, unread badge count.
- Conditions: nav items filtered by role.
- Validations: selected team id from known options.
- Blocking rules: `needsClubSetup` redirects to club page.
- Automations: interval refresh every 30s for unread count.

## 8. Data Model
- `Me.role/teamId/managedTeamIds`
Source: auth context.
Purpose: nav and scope permissions.
Format: role enum and ids.
Constraints: must match backend authorization.
- Team option list
Source: `useTeamScope` API fetch.
Purpose: active context switching.
Format: `[id,name]`.
Constraints: role-scoped.

## 9. Business Rules
- Unauthorized routes are guarded client-side and server-side.
- Team selector appears only when `canSelectTeam` is true.
- Badge count fetch failures do not block navigation.

## 10. State Machine
- States: `UNAUTH`, `AUTH_WITH_SHELL`, `FORCED_SETUP`, `PUBLIC_VIEW`.
- Transitions: auth and role/scope changes.
- Triggers: login/logout/route change/team selection.
- Invalid transitions: rendering protected page without `me` context.

## 11. UI Components
- App header.
- Sidebar nav.
- Team scope selector.
- Route guard wrappers.

## 12. Routes / API / Handlers
- Front routes declared in `App.tsx`.
- API: `/team-messages/unread-count`, team scope endpoints via `useTeamScope`.
- Hooks/stores: `useAuth`, `useTeamScope`.

## 13. Persistence
- Local state: menu open, unread count, selected team id.
- External persistence: active team persisted backend-side via `/me/team`.

## 14. Dependencies
- Upstream: auth and team endpoints.
- Downstream: all feature pages.
- Cross-repo: similar shell logic exists on iOS.

## 15. Error Handling
- Validation: invalid team selection blocked by backend.
- Network: unread count and team load fail gracefully.
- Permissions: unauthorized routes redirect to fallback.
- Broken states: inconsistent role->default-route mapping can cause loops.
- Current vs expected: no centralized route error boundary.

## 16. Security
- Access control: route-level guards.
- Data exposure: nav hides unauthorized areas but backend remains source of truth.
- Guest rules: shell disabled for public pages.

## 17. UX Requirements
- Feedback: visible active page and unread indicators.
- Errors: silent badge failures should avoid noisy UX.
- Empty states: no teams available should be explicit.
- Loading: top-level loader until auth context resolves.
- Responsive: off-canvas sidebar on small screens.

## 18. Ambiguities & Gaps
- Observed
- Some legacy public route aliases are still present.
- Inferred
- Migration support for old URLs is intentional.
- Missing
- Formal route matrix by role in docs.
- Tech debt
- Routing and shell concerns are tightly coupled in one file.

## 19. Recommendations
- Product: publish role-to-route matrix as contract.
- UX: add explicit no-team guidance when selection required.
- Tech: split shell layout and route config modules.
- Security: monitor unauthorized route attempts in telemetry.

## 20. Acceptance Criteria
1. Each role sees only allowed nav items.
2. Team switch updates scoped data across pages.
3. Unauthorized routes redirect safely.
4. Unread badge updates periodically without UI freeze.

## 21. Test Scenarios
- Happy path: coach switches team and sees scoped pages.
- Permissions: parent cannot access `/effectif`.
- Errors: unread API fails and UI remains usable.
- Edge cases: direction without team forced to `/club`.

## 22. Technical References
- `src/App.tsx`
- `src/components/RouteGuards.tsx`
- `src/useTeamScope.tsx`
- `src/authz.ts`
