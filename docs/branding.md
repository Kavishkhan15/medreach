# MedReach brand assets

[Documentation](README.md) · [Project overview](../README.md)

The supplied artwork is shared by Bootstrap, Tailwind and Skeleton.

| Asset | Canonical file | Usage |
| --- | --- | --- |
| Wordmark | [`brand-word-mark.png`](../brand-word-mark.png) | Website navigation and footers |
| Shield symbol | [`logo.png`](../logo.png) | Browser favicon and Apple touch icon |

![MedReach wordmark](../brand-word-mark.png)

Each frontend serves unchanged copies of both PNG files from its `public/` directory. The wordmark has a 3:1 aspect ratio; preserve that ratio when displaying it. The shield symbol is square. Keep the supplied artwork and background intact.

Root layout metadata uses `/logo.png` directly for browser, shortcut and Apple touch icons. Its `v` query parameter is the first 12 characters of the canonical PNG’s SHA-256 hash, so replacing the artwork can refresh cached browser icons when that value is updated.

Each frontend’s `public/favicon.ico` is derived from the shield symbol, with 16, 32 and 48 pixel sizes. The public ICO remains available at `/favicon.ico` for browsers that request that path automatically. It lives in `public/` rather than `app/` so Next.js does not add an additional ICO link alongside the explicit PNG favicon. There is no root `favicon.ico`.

When replacing branding, update the canonical files, all three public copies, all three ICO files and the icon version in all three root layouts together. Check navigation, footer and browser icons, including narrow-screen navigation.

## Documentation images

The project README uses the supplied wordmark and actual public-page captures
from [the screenshot gallery](screenshots/README.md). Current images live in
`docs/screenshots/current/`, with route/viewport/date metadata in the manifest.
Use relative image links so previews work both on GitHub and in a clone.

Capture the real interface rather than composing fake provider cards. Do not
publish credentials, private account pages, patient histories or tracking tokens.
This refresh adds no external stock images, generated artwork or new font assets.
The provenance of underlying existing brand/landing artwork is not changed or
newly licensed by taking a screenshot.
