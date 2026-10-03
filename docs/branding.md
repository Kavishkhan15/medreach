# MedReach brand assets

The supplied artwork is shared by Bootstrap, Tailwind and Skeleton.

| Asset | Canonical file | Usage |
| --- | --- | --- |
| Wordmark | [`brand-word-mark.png`](../brand-word-mark.png) | Website navigation, footers and the repository README |
| Shield symbol | [`logo.png`](../logo.png) | Browser favicon and Apple touch icon |

![MedReach wordmark](../brand-word-mark.png)

Each frontend serves unchanged copies of both PNG files from its `public/` directory. The wordmark has a 3:1 aspect ratio; preserve that ratio when displaying it. The shield symbol is square. Keep the supplied artwork and background intact.

The root `favicon.ico` and each frontend’s `app/favicon.ico` are derived from the shield symbol, with 16, 32 and 48 pixel sizes. Next.js serves the frontend ICO at `/favicon.ico`; root layout metadata also points Apple touch icons to `/logo.png`.

When replacing branding, update the canonical files, all three public copies and all four ICO files together. Check the README image, navigation, footer and browser icons, including narrow-screen navigation.
