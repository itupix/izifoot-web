# Stats And Public Matchday Consumption

## 1. Summary
- Clear description: Provides internal stats dashboard and public matchday read-only page by token.
- User problem solved: Staff need analytics; external users need shared matchday visibility.
- Product value: Decision support plus controlled information sharing.
- Repository: `izifoot-web`.
- Status: existing (stats aggregates are basic).

## 2. Product Objective
- Why it exists: Quantify team activity and expose public schedule information.
- Target users: direction/coach for stats; guests/parents/players for public link.
- Context of use: `/stats` and `/matchday/public/:token`.
- Expected outcome: accessible aggregates and reliable public read-only matchday page.

## 3. Scope
Included
- `Stats.tsx` aggregate computations from matches/players/matchdays/attendance.
- `PublicPlateauPage.tsx` tokenized public matchday fetch and render.

Excluded
- Deep analytics modeling and exports.

## 4. Actors
- Admin
Permissions: full stats access and public link sharing (from matchday feature).
Actions: consume analytics.
Restrictions: scope-bound data.
- Coach
Permissions: stats access.
Actions: consume analytics.
Restrictions: scope-bound.
- Parent
Permissions: no internal stats page; can open public link.
Actions: public consumption.
Restrictions: no protected stats route.
- Player
Permissions: same as parent for public links.
Actions: public consumption.
Restrictions: no protected stats route.
- Guest
Permissions: public token page only.
Actions: read shared data.
Restrictions: no private data.
- Unauthenticated user
Permissions: same as guest.
Actions: open token link.
Restrictions: no `/stats`.
- System
Permissions: computes client-side aggregates and normalizes public payload.
Actions: renders summary statistics and public matchday details.
Restrictions: depends on backend payload integrity.

## 5. Entry Points
- UI: `/stats`, `/matchday/public/:token` plus alias redirects.
- API: `/matches`, `/players`, `/matchday`, `/attendance`, `/public/matchday/:token`.

## 6. User Flows
- Main flow (stats): open page -> load datasets -> compute and display KPIs.
- Main flow (public): open token URL -> fetch and render read-only matchday.
- Variants: legacy URLs redirect to canonical public route.
- Back navigation: public page standalone, stats returns to protected app.
- Interruptions: token invalid or dataset fetch failure.
- Errors: public link error states and stats load failures.
- Edge cases: empty datasets.

## 7. Functional Behavior
- UI behavior: stats aggregates computed client-side.
- Actions: read-only operations only.
- States: loading, ready, empty, error.
- Conditions: `/stats` requires direction/coach; public route is open.
- Validations: token presence before public fetch.
- Blocking rules: no write actions.
- Automations: none.

## 8. Data Model
- `MatchLite`, `Player`, `Matchday`, `AttendanceRow`.
Source: protected endpoints.
Purpose: stats calculations.
Format: paginated normalized arrays.
Constraints: completeness affects KPI quality.
- Public matchday payload
Source: token endpoint.
Purpose: read-only external display.
Format: normalized matchday structure.
Constraints: only share-safe fields expected.

## 9. Business Rules
- Stats route restricted to direction/coach.
- Public route never requires authentication.
- Public payload should not expose internal-only identifiers beyond necessity.

## 10. State Machine
- Stats states: loading/ready/error.
- Public states: loading/ready/invalid-token.
- Invalid transitions: stats render without required datasets.

## 11. UI Components
- Stats cards/charts/summary sections.
- Public matchday read-only sections.

## 12. Routes / API / Handlers
- Front routes: `/stats`, `/matchday/public/:token`, legacy redirects.
- API: protected aggregate endpoints and `/public/matchday/:token`.

## 13. Persistence
- Client: ephemeral computed aggregates.
- Backend: canonical data in domain tables.

## 14. Dependencies
- Upstream: matchday/match/training/player features.
- Downstream: decision-making and stakeholder communication.
- Cross-repo: iOS has analogous stats and public matchday feature.

## 15. Error Handling
- Validation: missing token handled as invalid state.
- Network: fallback error messages.
- Missing data: empty arrays handled in KPI rendering.
- Permissions: `/stats` guard prevents unauthorized access.
- Current vs expected: public error experience can be richer.

## 16. Security
- Access control: protected stats route; public token route open.
- Data exposure: public payload must remain sanitized.
- Guest rules: guests restricted to public token pages.

## 17. UX Requirements
- Feedback: clear loading and invalid-link feedback.
- Empty states: no data available.
- Responsive: stats cards and public details mobile-friendly.

## 18. Ambiguities & Gaps
- Observed
- Stats rely entirely on client-side aggregation.
- Inferred
- Larger datasets may impact performance at scale.
- Missing
- Server-side analytics endpoint for pre-aggregated KPIs.
- Tech debt
- Duplicate normalization logic across pages.

## 19. Recommendations
- Product: prioritize KPI definitions with product owners.
- UX: add time-range and team filters.
- Tech: move heavy aggregates to backend endpoints.
- Security: periodically review public payload field exposure.

## 20. Acceptance Criteria
1. Direction/coach can view stats page with computed KPIs.
2. Public token page renders read-only matchday without auth.
3. Invalid token yields deterministic error state.
4. Stats page handles empty datasets gracefully.

## 21. Test Scenarios
- Happy path: load stats with populated datasets.
- Permissions: parent blocked from `/stats`.
- Errors: public token not found.
- Edge cases: all datasets empty.

## 22. Technical References
- `src/pages/Stats.tsx`
- `src/pages/PublicPlateauPage.tsx`
- `src/adapters/matchday.ts`
- `src/App.tsx`
