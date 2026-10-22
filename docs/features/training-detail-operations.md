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

## Training summary PDF
- Coaches and direction can use “Générer le résumé de la séance” above the information panel, including cancelled sessions.
- The authenticated `GET /trainings/:id/summary.pdf?timeZone=Europe%2FParis` request downloads `resume-seance-YYYY-MM-DD.pdf`; cookie/Bearer authentication and active team headers match other API requests.
- The server supplies session date/times, saved actual present players, and attached drills in saved order with full title and description. Attendance intentions are not actual presence, and attached drills have no separate completion flag.
- Export is disabled during saves, drill generation/reordering, and while information inputs (times or observations) differ from saved values. Save information first; failed exports show a recoverable inline error and can be retried.
- Permissions and errors follow the backend contract: 400 invalid timezone, 401 unauthenticated, 403 forbidden, 404 training missing, 500 PDF generation failure. PDF responses are private/no-store and never generated from local unsaved content.
- PDF dates and times use Europe/Paris consistently with iOS. The button explicitly states Paris time; the existing editable web time fields use the browser local timezone.

## Session observations
- A standalone “Observations” card follows the “Informations” card, with an optional multiline field and its own save action. Both cards share the left layout column on desktop and stack on mobile, preserving the attendance and programme layout. Existing information editing permissions and cancelled-session restrictions apply. Read-only users see the saved text, preserving line breaks.
- “Enregistrer les observations” sends only `observations: string | null` to `PUT /trainings/:id`; the information save sends only the times. Each save preserves the other section’s draft, including concurrent saves. Empty text sends `null` to clear observations; other text is sent unchanged with line breaks and no additional length limit. Training responses expose `observations: string | null`.
- The PDF includes saved observations through the unchanged server summary route. Export remains disabled while observations are unsaved or either section is saving, with a save-first message. A failed save retains the draft for retry.
