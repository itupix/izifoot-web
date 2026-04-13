# Drills Library And Diagram Editor

## 1. Summary
- Clear description: Drill catalog management plus dedicated diagram editor and AI-assisted generation flows.
- User problem solved: Coaches can prepare and visualize exercises.
- Product value: Better training quality and repeatability.
- Repository: `izifoot-web`.
- Status: existing (advanced tactical flows partial).

## 2. Product Objective
- Why it exists: Session preparation needs reusable content and tactical visuals.
- Target users: admin/coach.
- Context of use: `/exercices`, `/exercices/:id`, `/diagram-editor`.
- Expected outcome: maintainable drill library with linked diagrams.

## 3. Scope
Included
- `Drills.tsx`, `DrillDetailsPage.tsx`, `DiagramEditor.tsx`.
- Drill CRUD, diagram CRUD, AI generation actions.

Excluded
- Tactics API consumption not fully surfaced in this web module.

## 4. Actors
- Admin
Permissions: full drill/diagram management.
Actions: create/edit/delete drills and diagrams.
Restrictions: scope-bound.
- Coach
Permissions: same in managed scope.
Actions: same operations.
Restrictions: no unmanaged team data.
- Parent
Permissions: route blocked.
Actions: none.
Restrictions: no access.
- Player
Permissions: route blocked.
Actions: none.
Restrictions: no access.
- Guest
Permissions: none.
Actions: none.
Restrictions: blocked.
- Unauthenticated user
Permissions: none.
Actions: none.
Restrictions: redirected.
- System
Permissions: normalizes diagram payloads and AI responses.
Actions: saves canvas data.
Restrictions: depends on backend schema stability.

## 5. Entry Points
- UI: drills list/detail/editor routes.
- API: drills, diagrams, training-drill diagrams, AI generation endpoints.

## 6. User Flows
- Main flow: create drill -> open detail -> edit diagram -> save.
- Variants: AI-generate diagram from drill or training drill context.
- Back navigation: from editor/detail to list.
- Interruptions: generation timeout/failure.
- Errors: invalid diagram data.
- Edge cases: diagram orphaned from deleted drill.

## 7. Functional Behavior
- UI behavior: pagination + filtering in list, form editing in detail.
- Actions: mutate drill metadata and diagram canvas payload.
- States: loading, saving, generated preview ready.
- Conditions: role guard for direction/coach.
- Validations: required drill fields and diagram structure presence.
- Blocking rules: save disabled during requests.
- Automations: optional AI generation.

## 8. Data Model
- `Drill`, `Diagram`, `GenerateTrainingDrillsResponse` items.
Source: API routes.
Purpose: editor and list rendering.
Format: typed interfaces and normalization helpers.
Constraints: backend ownership/scope.

## 9. Business Rules
- Drill creation can include seed diagram.
- Diagram API path depends on source context (drill vs trainingDrill).
- AI generation output is persisted as regular diagrams.

## 10. State Machine
- Drill states: created/updated/deleted.
- Diagram states: created/updated/deleted.
- AI states: idle -> generating -> generated/error.
- Invalid transitions: save without resolved drill context.

## 11. UI Components
- Drill list and filters.
- Drill detail forms.
- DiagramComposer and related editor components.
- AI generation action controls.

## 12. Routes / API / Handlers
- Front routes: `/exercices`, `/exercices/:id`, `/diagram-editor`.
- API: `/drills*`, `/training-drills/:id/diagrams*`, `/diagrams/:id`.

## 13. Persistence
- Client: component state for drill and canvas operations.
- Backend: drill/diagram/trainingDrill entities.

## 14. Dependencies
- Upstream: role guards and team scope.
- Downstream: training detail drill assignment.
- Cross-repo: iOS drills feature currently lower coverage for diagram editing.

## 15. Error Handling
- Validation: drill form and diagram payload checks.
- Network: load/save/generate errors shown in UI.
- Missing data: deleted drill/diagram returns not found state.
- Permissions: route guard + backend scope errors.
- Current vs expected: AI failure handling could be more structured.

## 16. Security
- Access control: direction/coach route restrictions.
- Data exposure: scoped API data only.
- Guest rules: blocked.

## 17. UX Requirements
- Feedback: save indicator and generation status.
- Empty states: no drills or no diagrams.
- Loading: paginated fetch and editor load skeleton.
- Responsive: editor usability on small screens needs validation.

## 18. Ambiguities & Gaps
- Observed
- Diagram JSON schema is implicit in component code.
- Inferred
- Future tactical modules may consume same schema.
- Missing
- Formal JSON schema and migration strategy.
- Tech debt
- Editor complexity distributed across multiple interdependent components.

## 19. Recommendations
- Product: define clear tactical editing roadmap (diagram vs tactics).
- UX: provide autosave and unsaved-change warnings.
- Tech: publish diagram JSON schema and validation library.
- Security: throttle AI generation actions.

## 20. Acceptance Criteria
1. Coach/direction can CRUD drills.
2. Diagram editor can create and update diagrams.
3. AI generation can produce diagrams attached to context.
4. Unauthorized roles cannot access drill routes.

## 21. Test Scenarios
- Happy path: create drill with diagram and reopen successfully.
- Permissions: player denied route.
- Errors: save invalid diagram payload.
- Edge cases: trainingDrill-linked diagram generation after training deletion.

## 22. Technical References
- `src/pages/Drills.tsx`
- `src/pages/DrillDetailsPage.tsx`
- `src/pages/DiagramEditor.tsx`
- `src/components/DiagramComposer.tsx`
