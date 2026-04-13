# Auth Home And Invite Acceptance

## 1. Summary
- Clear description: Handles login/register entry page and invitation acceptance flow.
- User problem solved: Allows users to enter app and finalize invited accounts.
- Product value: First-mile onboarding for all roles.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: All protected navigation depends on authenticated session.
- Target users: unauthenticated users and invited users.
- Context of use: landing page `/` and `/invite/accept` route.
- Expected outcome: authenticated session and redirected role-specific workspace.

## 3. Scope
Included
- `Home.tsx` auth form flow.
- `InviteAcceptPage.tsx` token lookup and acceptance.
- `useAuth` integration for refresh after acceptance.

Excluded
- Post-auth app shell behavior.

## 4. Actors
- Admin
Permissions: login/register/invite acceptance.
Actions: access direction routes after auth.
Restrictions: guarded by role checks for privileged pages.
- Coach
Permissions: login/invite acceptance.
Actions: access coach routes.
Restrictions: role guard enforced.
- Parent
Permissions: login/invite acceptance.
Actions: access parent-compatible routes.
Restrictions: no coach/direction-only pages.
- Player
Permissions: login/invite acceptance.
Actions: access planning/messages/account.
Restrictions: no roster/drills pages.
- Guest
Permissions: can view auth forms and invitation entry.
Actions: submit credentials or token acceptance.
Restrictions: no protected routes.
- Unauthenticated user
Permissions: same as guest.
Actions: open public home and invite URL.
Restrictions: route guards redirect away from protected pages.
- System
Permissions: validates auth state in `useAuth`.
Actions: refreshes user context.
Restrictions: dependent on backend auth endpoints.

## 5. Entry Points
- UI: `/` and `/invite/accept?token=...`.
- Routes: defined in `App.tsx`.
- External links: invite URLs from backend.
- API triggers: `apiRoutes.auth.*` and `/me` refresh.

## 6. User Flows
- Main flow: user submits login/register -> `useAuth` refresh -> routed by role.
- Variants: invite token accepted before normal login.
- Back navigation: can return to home and re-attempt.
- Interruptions: expired/invalid invite token.
- Errors: displayed form-level errors.
- Edge cases: token present but missing password fields.

## 7. Functional Behavior
- UI behavior: form modes for login/register with async submission.
- Actions: call auth endpoints and load session user.
- States: idle/loading/success/error.
- Conditions: valid token required for invite accept.
- Validations: client field checks + backend validation.
- Blocking rules: protected pages use `RequireAuth`/`RequireRole`.
- Automations: none.

## 8. Data Model
- `InvitationDetails`
Source: `GET /auth/invitations/:token`.
Purpose: render invite context.
Format: id/email/role/status/expiresAt.
Constraints: token validity.
- Auth payload
Source: login/register forms.
Purpose: session creation.
Format: email/password plus clubName for register.
Constraints: backend validation.

## 9. Business Rules
- Invite acceptance must call backend token endpoint first.
- Successful invite acceptance triggers auth refresh.
- Route fallback redirects authenticated users to role default route.

## 10. State Machine
- States: `UNAUTHENTICATED`, `AUTH_LOADING`, `AUTHENTICATED`, `INVITE_LOADING`, `INVITE_ERROR`.
- Transitions: submit auth/invite forms and resolve responses.
- Invalid transitions: accessing protected route without session.

## 11. UI Components
- Home auth forms.
- Invite acceptance page with status feedback.
- Route guards.

## 12. Routes / API / Handlers
- Front routes: `/`, `/invite/accept`.
- API: `/auth/register`, `/auth/login`, `/auth/invitations/:token`, `/auth/invitations/accept`, `/me`.
- Hooks: `useAuth`.

## 13. Persistence
- Client persistence: auth token/session is backend-managed; frontend stores auth state in memory and local token store hooks.
- Models: `Me`, `InvitationDetails` types.

## 14. Dependencies
- Upstream: backend auth contract.
- Downstream: all protected web pages.
- Cross-repo: parity expected with iOS auth flows.

## 15. Error Handling
- Validation: backend errors mapped to user-facing messages.
- Network: fallback error banner and retry.
- Missing data: invite details fetch failure shows invalid-link state.
- Permissions: route guard redirection.
- Current vs expected: error payload shape not fully normalized.

## 16. Security
- Access control: client route guards + backend enforcement.
- Data exposure: no private data before auth.
- Guest rules: only public auth routes accessible.

## 17. UX Requirements
- Feedback: clear success/error messages per submission.
- Empty states: invite not found/expired.
- Loading: disable submit while request pending.
- Responsive: form must render on mobile.

## 18. Ambiguities & Gaps
- Observed
- Mixed field naming across API payloads requires tolerant decoders.
- Inferred
- Invite flow targets both first-time and existing accounts.
- Missing
- Explicit frontend mapping of backend error codes.
- Tech debt
- Legacy naming aliases increase adapter complexity.

## 19. Recommendations
- Product: define invite UX for already-authenticated users.
- UX: standardize error message copy by status code.
- Tech: centralize auth error mapping utility.
- Security: ensure CSRF/session handling is documented.

## 20. Acceptance Criteria
1. User can login/register from home.
2. Invite token page can validate and accept invitation.
3. Success redirects user to role default route.
4. Invalid token shows deterministic error state.

## 21. Test Scenarios
- Happy path: login and reach `/planning`.
- Permissions: unauthenticated access to protected route redirects.
- Errors: wrong password and expired invite token.
- Edge cases: accept invite then refresh page.

## 22. Technical References
- `src/pages/Home.tsx`
- `src/pages/InviteAcceptPage.tsx`
- `src/useAuth.tsx`
- `src/components/RouteGuards.tsx`
- `src/apiRoutes.ts`
