# Messages And Reactions

## 1. Summary
- Clear description: Team messaging feed with creation, like/unlike reactions, and unread-count updates.
- User problem solved: Team communication in one shared timeline.
- Product value: Keeps users aligned on operational updates.
- Repository: `izifoot-web`.
- Status: existing.

## 2. Product Objective
- Why it exists: Asynchronous team communication is required between sessions.
- Target users: authenticated roles with messaging access.
- Context of use: `/messages` route and shell badge.
- Expected outcome: messages can be read, posted, and reacted to with accurate unread counters.

## 3. Scope
Included
- `MessagesPage.tsx` team feed and reaction logic.
- shell unread badge integration via polling/event.

Excluded
- Direct conversation UI (currently more prominent in iOS or future web iterations).

## 4. Actors
- Admin
Permissions: read/write/react in scoped team feed.
Actions: broadcast messages.
Restrictions: scope-bound.
- Coach
Permissions: read/write/react.
Actions: same.
Restrictions: scope-bound.
- Parent
Permissions: read/react (and possibly write based on backend policy).
Actions: consume updates.
Restrictions: scope-bound.
- Player
Permissions: read/react (and possibly write by policy).
Actions: consume updates.
Restrictions: scope-bound.
- Guest
Permissions: none.
Actions: none.
Restrictions: blocked.
- Unauthenticated user
Permissions: none.
Actions: none.
Restrictions: redirected.
- System
Permissions: polls unread count and dispatches update events.
Actions: keeps badge in sync.
Restrictions: dependent on backend count endpoint.

## 5. Entry Points
- UI: `/messages`.
- API: `/team-messages`, `/team-messages/:id/reactions/like`, `/team-messages/unread-count`.

## 6. User Flows
- Main flow: open messages -> read list -> post message -> like/unlike.
- Variants: unread count refresh from shell timer.
- Back navigation: return to previous route.
- Interruptions: fetch or reaction request failures.
- Errors: posting failures and reaction failures.
- Edge cases: unread count desync after network loss.

## 7. Functional Behavior
- UI behavior: message list with content, author, like state.
- Actions: create message and toggle likes.
- States: loading/sending/toggling reaction.
- Conditions: authenticated role with messaging route access.
- Validations: non-empty message content.
- Blocking rules: disable actions during in-flight calls.
- Automations: global unread badge refresh event.

## 8. Data Model
- `TeamMessage`, `TeamMessagesResponse`.
Source: team message API.
Purpose: render feed and reactions.
Format: id/content/author/timestamps/likes metadata.
Constraints: backend scope and read markers.

## 9. Business Rules
- Reaction endpoint is idempotent through POST/DELETE pairing.
- Feed content is team-scoped.
- Shell badge should react to message updates.

## 10. State Machine
- Message states: loaded/new/failed-post.
- Reaction states: liked/unliked/updating.
- Badge states: stale -> refreshed.
- Invalid transitions: like action on missing message id.

## 11. UI Components
- Messages page list and composer.
- Reaction controls.
- Sidebar unread badge.

## 12. Routes / API / Handlers
- Front route: `/messages`.
- API: team message list/create, like/unlike, unread count.

## 13. Persistence
- Client: in-memory feed state.
- Backend: team message and reaction tables.

## 14. Dependencies
- Upstream: auth and scope hooks.
- Downstream: shell badge and notification cues.
- Cross-repo: iOS messaging module covers conversation flow too.

## 15. Error Handling
- Validation: empty message blocked.
- Network: retryable failures for load and send.
- Missing data: missing message list fallback to empty.
- Permissions: forbidden errors from backend.
- Current vs expected: richer offline handling not observed.

## 16. Security
- Access control: authenticated route plus backend scope.
- Data exposure: team-only messages.
- Guest rules: denied.

## 17. UX Requirements
- Feedback: message send confirmation and errors.
- Empty states: no messages yet.
- Loading: spinner/skeleton while loading feed.
- Responsive: message composer usable on mobile.

## 18. Ambiguities & Gaps
- Observed
- Web currently emphasizes team feed over direct conversations.
- Inferred
- Direct message UI may be planned for future parity.
- Missing
- Explicit moderation/reporting controls.
- Tech debt
- Unread synchronization relies on polling + custom events.

## 19. Recommendations
- Product: define direct conversation roadmap for web.
- UX: improve optimistic update behavior for send/reaction.
- Tech: centralize messaging state in store.
- Security: add content-rate limiting and abuse protections.

## 20. Acceptance Criteria
1. Authenticated user can load team messages.
2. User can post message and see it in list.
3. Like/unlike updates counts and state.
4. Unread count updates in shell.

## 21. Test Scenarios
- Happy path: post then like message.
- Permissions: unauthorized access redirected.
- Errors: like request fails and UI rolls back.
- Edge cases: rapid like/unlike toggles.

## 22. Technical References
- `src/pages/MessagesPage.tsx`
- `src/App.tsx`
- `src/apiRoutes.ts`
