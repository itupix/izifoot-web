# Account Profile Management

## 1. Summary
- Clear description: Displays and edits current user profile with role-aware linked child/team context.
- User problem solved: Users need to maintain personal data and inspect account context.
- Product value: Improves account data quality and supportability.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: Account metadata is needed for communications and role clarity.
- Target users: all authenticated roles.
- Context of use: `/account`.
- Expected outcome: editable profile fields saved to backend and reflected in auth context.

## 3. Scope
Included
- `AccountPage.tsx` profile read/edit flow.
- Password change inside the account edit flow.
- Team lookup for display.
- Parent linked-child fetch display.

Excluded
- Invite acceptance and login flows.

## 4. Actors
- Admin
Permissions: view/edit own profile.
Actions: update profile fields and change own password.
Restrictions: no other-user edits.
- Coach
Permissions: same as admin for own account.
Actions: same.
Restrictions: own account only.
- Parent
Permissions: own profile + linked child context.
Actions: update own info and password.
Restrictions: child data read-only.
- Player
Permissions: own profile.
Actions: update own info and password.
Restrictions: no others.
- Guest
Permissions: none.
Actions: none.
Restrictions: no access.
- Unauthenticated user
Permissions: none.
Actions: none.
Restrictions: redirected.
- System
Permissions: merges `/me`, `/teams`, `/me/child` data.
Actions: applies the `PUT /me/profile` response to auth context immediately, then keeps ancillary reads separate.
Restrictions: must keep role context accurate.

## 5. Entry Points
- UI: `/account` route.
- API: `/me/profile`, `/me/password`, `/teams`, `/me/child`.

## 6. User Flows
- Main flow: open account -> edit profile and optional password fields -> save -> auth context updates immediately and success closes the modal without a blocking alert.
- Variants: parent sees linked child info block.
- Back navigation: return to previous feature route.
- Interruptions: save failure.
- Errors: validation/network errors.
- Edge cases: linked child missing.

## 7. Functional Behavior
- UI behavior: displays read-only account metadata and editable fields.
- Actions: send profile update payload and optional password update payload.
- States: loading, edit mode, saving, error.
- Conditions: authenticated user only.
- Validations: field-level checks before submit.
- Blocking rules: disable save while request pending.
- Automations: no secondary auth refresh required after a successful profile update.

## 8. Data Model
- `Me`, `Team`, linked child shape.
Source: auth and account endpoints.
Purpose: account detail rendering.
Format: typed interfaces with alias handling.
Constraints: backend data consistency.

## 9. Business Rules
- Only current user profile can be updated.
- Password change requires the current password.
- Parent-specific linked child data is read-only.
- Team display relies on team list lookup.

## 10. State Machine
- States: view/edit/saving/error.
- Transitions: enter edit, save success/failure, cancel edit.
- Invalid transitions: save without authenticated context.

## 11. UI Components
- Account summary panel.
- Profile edit form.
- Linked child info section.

## 12. Routes / API / Handlers
- Front route: `/account`.
- API: `/me/profile`, `/me/password`, `/teams`, `/me/child`.

## 13. Persistence
- Client: form state local to page.
- Backend: `User` record update and password hash rotation.

## 14. Dependencies
- Upstream: auth context.
- Downstream: messages/contact usability.
- Cross-repo: iOS account view mirrors same contract.

## 15. Error Handling
- Validation: invalid fields blocked locally and server-side.
- Validation: password confirmation and minimum length blocked locally before request.
- Network: save errors surfaced.
- Missing data: linked child call failure tolerated.
- Permissions: unauthenticated access blocked.
- Current vs expected: error copy can be more specific.

## 16. Security
- Access control: auth required.
- Data exposure: only own profile and linked child.
- Guest rules: blocked.

## 17. UX Requirements
- Feedback: failures remain explicit; successful save closes the modal without a blocking alert.
- Empty states: missing optional fields display fallback.
- Loading: initial profile load indicator.
- Responsive: form readable on mobile.

## 18. Ambiguities & Gaps
- Observed
- Profile payload naming variants still supported.
- Inferred
- Legacy clients influence backend field flexibility.
- Missing
- Dedicated profile completion indicator.
- Tech debt
- Alias handling repeated across UI and type models.

## 19. Recommendations
- Product: define mandatory profile fields by role.
- UX: improve edit affordances and validation hints.
- Tech: centralize user-field normalization.
- Security: add auditing for profile update events.

## 20. Acceptance Criteria
1. Authenticated user can view account data.
2. User can update profile and see refreshed values.
3. User can change password by providing current password and confirmation.
4. Parent can view linked child block when available.
5. Save errors are shown without breaking page.

## 21. Test Scenarios
- Happy path: edit first/last name and save.
- Happy path: change password with correct current password.
- Permissions: unauthenticated redirect.
- Errors: backend validation error.
- Errors: wrong current password or password confirmation mismatch.
- Edge cases: linked child endpoint returns null.

## 22. Technical References
- `src/pages/AccountPage.tsx`
- `src/useAuth.tsx`
- `src/apiRoutes.ts`
