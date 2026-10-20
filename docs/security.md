# Security

## Roles and organisation isolation

New account roles are `system_admin`, `provider_admin` and `user`.
Public registration cannot select an administrator role. Platform APIs require
System Admin independently of frontend visibility.

Provider membership includes user, organisation ID, kind and active state.
Protected provider requests, reports, availability and Careers operations check
that scope on the backend. An organisation switcher is a convenience, not an
authorization control.

Legacy `admin` and `user_admin` records do not confer global privileges.
Existing `hospital_admin` compatibility is limited to historical assigned
hospital relationships. Do not silently promote or delete legacy accounts.
Inventory their references before an approved migration.

System Admin role/status mutations use a serialized guard to protect the last
active System Admin against concurrent deactivation/demotion. Preserve the main
`/admin` dashboard; there is no replacement User Admin role.

## Account lifecycle

- bcrypt password hashing retains its existing cost; performance work does not
  weaken password verification.
- Access JWTs require a valid active database-backed session and current
  account status/version. Refresh sessions rotate and can be revoked.
- Activation, recovery and notification-address verification use hashed,
  expiring tokens. Contact/state/version checks prevent old links from taking
  effect after an account or contact changes.
- Generic user management cannot bypass provider activation.
- Password resets, account/assignment changes revoke applicable stale sessions.
- Production invitations require eligible contacts; `.example` login IDs
  are not deliverable notification addresses.
- Shared demo defaults retain the isolated-database/email-disabled guard.
  Local manual credential handover has separate environment/transport checks.
  Generated secrets are returned only on generation/reset; only hashes persist.

## Private requests and patient information

Owner, assigned provider, System Admin or an applicable private guest token is
required for detailed request access. Reference-only tracking exposes reference,
status and update time, not contact/medical details or mutation permission.
Guest tokens must stay out of logs and shared public URLs.

Mutation validation and stale-state checks retain the existing request lifecycle.
An emergency classification is explicit; `ambulanceRequired` alone is insufficient.

## Notification reliability

Ordinary requests notify relevant eligible providers and the user. Explicit bed,
blood and ambulance emergencies also notify configured active System Admins.
Notification contacts/preferences and assignment eligibility are checked,
including before a delayed RequestNotification send.

Replay-safe messages use encrypted durable outbox content, deduplicated event
keys and atomic delivery leases. The worker processes only explicit queued rows,
in bounded batches, with bounded failure recovery. It does not replay arbitrary
historical rows. Permission/contact changes can invalidate a pending recipient.

Account links remain inline and non-replayable: no raw reset/activation token
is retained in an email retry envelope. Sensitive account actions may still
wait for the transport timeout.

Sent means SMTP/Resend acceptance. Definitive failures and ambiguous outcomes
are distinct; uncertain sends are not automatically repeated. Exactly-once
mail delivery cannot be guaranteed across a transport/persistence crash.
No new inbox-delivery claim is made by a successful HTTP response.

## HTTP and secrets

Security middleware enforces origin restrictions, rate limits, scalar query
parameters and security headers. Production must configure trusted proxy
boundaries and cross-site cookies correctly. Private/authenticated responses
remain `no-store`; public directory revalidation does not cache patient data.

Secrets belong in backend environment variables. Never expose MongoDB, SMTP,
Resend or JWT secrets through `NEXT_PUBLIC_*`. Rotating `JWT_SECRET` affects
sessions, guest credential recovery and encrypted email content.

Resume links/uploads retain existing safety validation. Directory-grounded AI
fallbacks do not invent providers or availability; enabling an external AI
service is a privacy decision described in [privacy](privacy.md).

## Data and deployment boundaries

Stored provenance remains even though crawler execution and scraping badges are
removed. Do not seed/reset the recovered dataset or automatically migrate roles.
Standalone MongoDB does not provide crash-atomicity across every multi-document
business/audit operation.

See [verification](release-qa.md), [deployment](deployment.md) and
[stored data](stored-data.md). Automated checks do not establish absence of
vulnerabilities, regulatory certification or hosted readiness.
