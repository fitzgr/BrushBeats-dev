# Brush Beats — household plans and invitations (development draft)

Status: **data model, capacity policy, and feature-gated adult invitation API**.
The invitation API is disabled by default (`ENABLE_HOUSEHOLD_INVITATIONS` is not
`true`). This branch does **not** send live invites, grant new household sync
access to invited accounts, register devices, charge money, change production,
or run database migrations.

## Agreed proposed UK launch tiers

| Plan | Proposed GBP annual price | Brushing profiles | Registered devices |
| --- | ---: | ---: | ---: |
| Brush Beats Family | £14.99 | 6 | 5 |
| Brush Beats Family Plus | £24.99 | 12 | 10 |

One verified paying adult **owns** each household. The owner decides who joins
and can revoke invitations and enrolled devices. A normal example is two adults
and two children; six profiles includes room for larger families. Members may
brush wherever they are; there is no home Wi-Fi, GPS or IP geofence.

A *brushing profile* is a named person. A *registered device* is a phone, tablet
or other client authorized to use household data. They are different quotas.
A child does not need an email account: the parent can enrol a device and
select that child's brushing profile. A spouse can join using an invitation
to their own verified account. Registration limits are NOT proof of residence.

## Staged implementation

1. **This feature branch:** additive SQL migration for plan catalogue, owner
   invitations, account memberships and device registration; pure, tested
   capacity policy. Existing Neon Auth, 60-day trials, tooth settings and
   historical billing records remain intact.
2. **Invitation API (implemented behind disabled flag):** uses long, random,
   single-use tokens; persists only SHA-256 token digests; enforces 72-hour
   expiry, owner authorization, recipient email matching, atomic redemption,
   capacity checks and a ten-invitations-per-day household cap. Owners may
   list and revoke pending invites. A token is returned once to the owner for
   manual handling; no delivery integration or usable invite screen exists.
   **Acceptance records an account membership but does not grant access to
   household sync, music, profiles or device credentials**. A future member-
   scoped authorization path and owner revocation must be added first.
   Provisional device access and low-friction email-link onboarding remain
   unimplemented. Neon Auth's verified-email requirement remains in force.
3. **Server-side limits and device management (not yet implemented):** count
   non-deleted, non-archived person profiles plus active/unexpired provisional
   registered devices. Lock a household row and recount within a transaction
   before adding a profile or enrolling a device. Add owner-controlled
   device replacement/revocation and tests for concurrent enrolments.
4. **Billing integration (not yet implemented):** choose a payment provider
   with support for UK GBP and automatic yearly renewal; create provider
   prices from the agreed plan catalogue, reconcile signed server webhooks,
   handle upgrades, expiry and cancellation, and never trust client-set
   tiers. Verify UK consumer pricing/tax and store policy before checkout.
5. **Security and release:** apply migrations on a test Neon branch, run
   integration tests and threat modelling, verify email/OTP and link
   behaviour; only then merge and consider production rollout.

## Compatibility and known constraints

- The earlier dev billing schema sets **£4.99** as the historical
  \`price_minor\` default. Migration 004 changes the default for *new*
  subscription rows to 1499 and adds a \`plan_code\`, but deliberately does
  **not** overwrite existing subscription records or their negotiated prices.
- \`household_subscriptions.price_minor\` is legacy state, not authority to
  bill. Checkout must use the plan catalogue and validated payment-provider
  plans; until then the frontend should not advertise subscriptions as live.
- The current household routes are **owner-only**. Do not grant access to
  invited members until an authenticated, scoped member/device permission
  check replaces the relevant owner-only path.
- Existing snapshots can include up to 20 members; this does not establish
  plan enforcement. This branch does not change that historical synchronization
  behaviour. Capacity must be enforced at the transactional server write path.
- Do not collect or use exact location, household Wi-Fi, or brushing habits to
  decide household membership. Flag unusual enrolment rates and device
  turnover for non-automatic review, respecting privacy and minors.

## Feature-gated adult invitation routes (development only)

- `POST /api/households/:householdId/invitations`: verified owner creates an
  email-bound, 72-hour, single-use adult invitation during an active entitlement.
  Responds with a secret **only once**; there is no email delivery yet.
- `GET /api/households/:householdId/invitations`: owner lists invitation metadata,
  never raw tokens.
- `DELETE /api/households/:householdId/invitations/:invitationId`: owner revokes
  a pending invitation.
- `POST /api/households/invitations/accept`: invited verified adult accepts
  their email-bound secret, creating a membership record without granting any
  household data access.

All routes require verified Neon authentication and the explicit
`ENABLE_HOUSEHOLD_INVITATIONS=true` gate. Do not enable this flag until the
Neon development schema is migrated and end-to-end invite tests pass. The
current basic rate limit is in-memory, not a distributed cross-instance limit;
production needs centrally enforced anti-abuse controls and safe delivery.
