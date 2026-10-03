# MedReach brand assets

The supplied artwork is shared by Bootstrap, Tailwind and Skeleton.

| Asset | Canonical file | Usage |
| --- | --- | --- |
| Wordmark | [`brand-word-mark.png`](../brand-word-mark.png) | Website navigation, footers and the repository README |
| Shield symbol | [`logo.png`](../logo.png) | Browser favicon and Apple touch icon |

![MedReach wordmark](../brand-word-mark.png)

Each frontend serves unchanged copies of both PNG files from its `public/` directory. The wordmark has a 3:1 aspect ratio; preserve that ratio when displaying it. The shield symbol is square. Keep the supplied artwork and background intact.

Root layout metadata uses `/logo.png` directly for browser, shortcut and Apple touch icons. Its `v` query parameter is the first 12 characters of the canonical PNG’s SHA-256 hash, so replacing the artwork can refresh cached browser icons when that value is updated.

The root `favicon.ico` and each frontend’s `public/favicon.ico` are derived from the shield symbol, with 16, 32 and 48 pixel sizes. The public ICO remains available at `/favicon.ico` for browsers that request that path automatically. It lives in `public/` rather than `app/` so Next.js does not add an additional ICO link alongside the explicit PNG favicon.

When replacing branding, update the canonical files, all three public copies, all four ICO files and the icon version in all three root layouts together. Check the README image, navigation, footer and browser icons, including narrow-screen navigation.
