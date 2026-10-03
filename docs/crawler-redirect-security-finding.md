# Crawler redirect crosses the approved-source boundary

## Security fix update — 2026-10-03

The earlier DNS, full-body timeout/size and unreadable-robots findings below are
superseded by tested fixes in both crawler copies. Actual connections pin public
DNS answers, bodies stream under a byte cap, and the timeout includes DNS and
body reads. Unreadable robots policies deny crawling; only genuine HTTP 404/410
permits a missing policy. Legacy feeds now check robots on initial/redirect URLs.
See [security verification](security-verification.md) and [current crawler](crawler.md).
The dated audit evidence below is preserved as history.


## Source correction before the security fix — 2026-10-03

This document preserves the original local finding and reproduction. The legacy
redirect gap described below has since been addressed: current
`BaseAdapter.fetchRaw()` validates the original origin and approved paths on
redirects, with legacy cross-origin, disallowed-path and allowed-path cases in
`crawler/tests/layers.test.js`. Both runtime copies match for this file.

Current robots handling also denies pages after a robots 401/403 or a rejected
robots redirect. Other unreadable robots outcomes still allow crawling. DNS
resolution/pinning and streamed response limits remain absent; responses are
buffered before length validation and the fetch timeout stops at headers. These
are separate remaining limitations, not resolved redirect findings.

No external site was contacted for this correction. For current implementation
and executed local verification, see [crawler](crawler.md) and
[Release QA](release-qa.md). Read the following “remaining legacy path” section
as the original audit's finding, rather than a claim that its redirect gap is
still open today.

## Original finding and reproduction — 2026-09-14

Status: reproduced locally with an injected fetch implementation. The current
hospital-site and directory pipeline is fixed and covered by regression tests.
The legacy adapter path remains exposed as described below. No external site
was contacted.

## Finding

`guardedFetch` checks the first URL against the source's approved host and path,
then checks robots.txt. When that response redirects, `httpFetch` checks the new
URL for private/local hosts but calls itself without repeating the source host,
path, or robots checks. A redirect to another public host can therefore fetch
content outside the approved source registry.

## Reproduction

An injected fetch implementation returned a 302 from the registered Lilavati
root to `https://example.org/unapproved`. The resulting request sequence was:

1. `https://www.lilavatihospital.com/robots.txt` (mocked)
2. `https://www.lilavatihospital.com/` (mocked 302)
3. `https://example.org/unapproved` (mocked 200)

Before the fix, `guardedFetch` returned `ok: true`. This proves a registry and robots boundary
failure on a public-host redirect. It does **not** prove access to a private
network or data leakage from any hospital website.

## Relevant code

- `crawler/src/fetchers/guardedFetch.js`: approved-host, path, and robots checks
  apply to the initial URL.
- `crawler/src/fetchers/httpFetcher.js`: redirect handling calls `httpFetch`
  recursively after checking only `assertSafeUrl(next)`.

## Impact and correction

An approved website that redirects, or an attacker who can influence a response
from it, can make MedReach fetch and parse a different public website. That can
pollute hospital records and make crawler traffic exceed the intended source
scope. The fix keeps the private-network SSRF guard and applies the registered
source's origin, path, and robots checks to **every** page redirect hop. The
robots.txt loader also refuses off-origin redirects. Redirects outside the
approved scope are blocked before the destination is requested.
Redirect chains are limited to five hops.

## Remaining legacy path

`BaseAdapter.fetchRaw()` in `crawler/src/adapters/baseAdapter.js` calls
`httpFetch()` without a `validateRedirect` callback. The legacy `crawlSource()`
runner can select `GenericHospitalAdapter` or `EnvelopedJsonAdapter`, both based
on this class. A local mock returned a redirect from
`https://example.org/approved` to `https://example.net/outside`; `fetchRaw()`
returned `ok: true` and recorded both URLs as fetched. The same implementation
exists in `backend/src/_crawler/`. This is a remaining approved-source boundary
gap for the legacy runner, not evidence of external-site data leakage.

`httpFetch()` also validates hostname text but does not resolve and pin DNS
addresses before connecting; a hostname resolving to a private address is a
potential SSRF gap that this mock audit did not exploit. Its response-size
check runs after `res.text()` has buffered the entire body. An unreadable or
redirect-rejected robots file is treated as missing and allows page fetching;
that policy needs separate review.

External vulnerability research requires the exact authorized domains,
endpoints, test window, accounts, request limits, and permitted techniques.
This finding concerns MedReach's own crawler only.
