# Training Detail Operations

## 1. Summary
- Clear description: Detailed training editor covering metadata, attendance, role assignments, and training drills.
- User problem solved: Coaches need one place to run a training session plan.
- Product value: Operational control for execution readiness.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: Session-level changes require contextual data and fast actions.
- Target users: admin/coach for edits, parent/player for limited intent visibility.
- Context of use: `/training/:id`.
- Expected outcome: reliable training configuration and participant state.

## 3. Scope
Included
- `TrainingDetailsPage.tsx`.
- Training update/delete.
- Attendance toggles and role assignment.
- Add/remove/reorder training drills and AI-generated drills.

Excluded
- Global planning creation.

## 4. Actors
- Admin
Permissions: full training mutations.
Actions: all editing operations.
Restrictions: scoped by team.
- Coach
Permissions: full scoped mutations.
Actions: all training operations in managed team.
Restrictions: no unmanaged team writes.
- Parent
Permissions: read-only context plus intent flow elsewhere.
Actions: no structural edits.
Restrictions: blocked from admin actions.
- Player
Permissions: read-only context plus intent flow elsewhere.
Actions: no structural edits.
Restrictions: blocked from admin actions.
- Guest
Permissions: none.
Actions: none.
Restrictions: no route.
- Unauthenticated user
Permissions: none.
Actions: none.
Restrictions: redirected.
- System
Permissions: consolidates multiple endpoint payloads.
Actions: keeps client state synchronized after mutations.
Restrictions: dependent on consistent API responses.

## 5. Entry Points
- UI: `/training/:id`.
- API: training, players, drills, attendance, roles, training-drills endpoints.

## 6. User Flows
- Main flow: load training context -> edit info -> manage attendance/roles/drills.
- Variants: run AI drill generation and append results.
- Back navigation: return to planning list.
- Interruptions: partial fetch failures.
- Errors: mutation failures for specific subactions.
- Edge cases: training without team players.

## 7. Functional Behavior
- UI behavior: parallel data load and sectioned editing UI.
- Actions: update status/date/end time, delete training, manage attendance/roles/drills.
- States: per-section loading and saving states.
- Conditions: role-based action availability.
- Validations: field checks and payload shape.
- Blocking rules: actions disabled during in-flight saves.
- Automations: optional AI drill suggestions.

## 8. Data Model
- `Training`, `AttendanceRow`, `TrainingRoleAssignment`, `TrainingDrill`, `Drill`.
Source: multiple API endpoints.
Purpose: render full training operation workspace.
Format: typed interfaces/adapters.
Constraints: ids and scope validity from backend.

## 9. Business Rules
- Attendance persistence uses shared helper `persistAttendanceToggle`.
- Role assignment updates replace or sync assignment list.
- Drill order updates are persisted via per-item PUT.

## 10. State Machine
- Detail states: `LOADING` -> `READY` -> `SAVING`/`ERROR`.
- Training status transitions: `PLANNED` <-> `CANCELLED`.
- Attendance states: per-player toggle.
- Invalid transitions: save actions without loaded training id.

## 11. UI Components
- Training info panel/form.
- Attendance accordion/section.
- Role assignment UI.
- Drill list with reorder and add/remove controls.

## 12. Routes / API / Handlers
- Front route: `/training/:id`.
- API: `/trainings/:id`, `/attendance`, `/trainings/:id/roles`, `/trainings/:id/drills*`, `/trainings/:id/drills/generate-ai`.

## 13. Persistence
- Client: section-local state and optimistic update fragments.
- Backend: training and related tables.

## 14. Dependencies
- Upstream: planning home navigation and scope.
- Downstream: stats and operational execution.
- Cross-repo: iOS training detail feature aims parity.

## 15. Error Handling
- Validation: invalid forms blocked before request.
- Network: section-specific error states.
- Missing data: fallback for optional intent payload.
- Permissions: forbidden errors surfaced.
- Current vs expected: missing unified toast/error framework.

## 16. Security
- Access control: route auth + backend role checks.
- Data exposure: scoped by backend.
- Guest rules: no access.

## 17. UX Requirements
- Feedback: clear save indicators for each section.
- Empty states: no players/no drills available.
- Loading: avoid blocking entire page for one failing subsection.
- Responsive: section stacking on narrow screens.

## 18. Ambiguities & Gaps
- Observed
- Multiple concurrent data dependencies can fail independently.
- Inferred
- Feature requires robust partial-failure UX.
- Missing
- Formal unsaved-change guard behavior.
- Tech debt
- Page component size and mutation branching are high.

## 19. Recommendations
- Product: define role-level read-only experience explicitly.
- UX: per-section inline retry actions.
- Tech: split page into hooks/modules by concern.
- Security: add telemetry for forbidden mutation attempts.

## 20. Acceptance Criteria
1. Training details load with attendance/roles/drills.
2. Coach/direction can mutate all training sections.
3. Save failures do not corrupt local state.
4. Unauthorized users cannot perform structural edits.

## 21. Test Scenarios
- Happy path: edit training info and attendance.
- Permissions: parent sees no edit actions.
- Errors: role update API failure.
- Edge cases: reorder drills after deletion.

## 22. Technical References
- `src/pages/TrainingDetailsPage.tsx`
- `src/components/AttendanceAccordion.tsx`
- `src/apiRoutes.ts`
