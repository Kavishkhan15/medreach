# Privacy by Design

MedReach is built to minimize personal data. It stores **no medical / PHI data
about users**, and it treats location as ephemeral.

## User data is minimal
The `User` model holds only:
- `email`
- `name`
- optional `emergencyContact` / `region`
- references to saved hospitals

No health records, diagnoses, or clinical history are stored.

## Location handling
- Geolocation is requested **only on demand** (the `useLocation` hook) and is
  **never persisted** by the app.
- A **manual Mumbai locality selection** is offered as an alternative to GPS.
- Denied / timeout / unavailable / unsupported cases are handled gracefully.

## Log minimization
- Structured logs record `method`, `route`, `status`, `duration`, and
  `requestId` **only**.
- Logs never contain request bodies, tokens, passwords, or personal data.

## Audit logs
- Store a **salted SHA-256 `ipHash`**, never the raw IP.
- Record only the `before`/`after` of **verification-status** changes.

## Admin surfaces
- Admin tables avoid exposing personal information.

## Demo / live transparency
- The `SystemBanner` clearly labels **DEMO fixture data** so it is never
  mistaken for live data.

## Assumptions & production requirements
The current design is privacy-conscious but is a research testbed. A production
deployment must additionally add:
- explicit **user consent** flows
- a documented **data retention policy**
- a **Data Processing Agreement (DPA)** where third parties are involved
