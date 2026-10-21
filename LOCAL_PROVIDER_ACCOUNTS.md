# Local provider account handling

[Documentation](docs/README.md) · [Project overview](README.md)

This is an operational guide, not a list of reusable passwords or a live
inventory. Inspect the confirmed local database before provisioning anything.
Never infer successful login from account creation alone.

## Identity and assignments

- System Admin retains the existing account/history when an approved login
  identity change is needed. Do not create a duplicate administrator.
- Provider Admin access comes from explicit active organisation memberships.
  Reuse appropriate existing accounts and preserve their assignments.
- Hospital, blood-bank, diagnostic and ambulance organisations are distinct
  unless authoritative records establish that they represent the same entity.
- Public registration creates regular users with their own passwords.

## Local manual credential handover

Bootstrap's `/admin/provider-accounts` supports guarded local provisioning and
unique generated passwords. Demo login IDs use organisation slugs and stable
IDs under `.example`; they are not real email addresses.

Only System Admin can generate/reset a password. The newly generated value can
be shown/copied during that session; the database stores only its hash. Closing
or refreshing the page loses the displayed value. Existing passwords cannot be
recovered or shown. A fresh reset revokes stale sessions.

The backend's local transport/environment checks remain authoritative. This
mode must not be enabled as a production credential shortcut. Tailwind and
Skeleton currently retain email-invitation account administration.

## Invitations and recovery

Use a real, verified notification contact separately from the login ID.
Production providers accept secure activation links and establish their own
passwords. Contact changes invalidate old links/sessions. Suspended accounts
and unverified recovery contacts do not bypass activation.

Shared demonstration defaults remain restricted to the existing isolated-demo
guard. They are not applied to the recovered dataset as part of performance or
documentation work. Never put passwords, private tokens or SMTP keys in docs.

See [security](docs/security.md), [API](docs/api.md) and
[verification](docs/release-qa.md).
