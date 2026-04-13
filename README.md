This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Stripe Sandbox Setup

Add these variables to `.env.local`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO_MONTHLY=price_...
```

What each value is used for:

- `STRIPE_SECRET_KEY`: server-side Stripe API access for Checkout, customer lookup, and billing portal.
- `STRIPE_WEBHOOK_SECRET`: verifies events sent to `/api/stripe/webhook`.
- `STRIPE_PRICE_ID_PRO_MONTHLY`: the Stripe Price ID for the Pro subscription used by the app.

Local webhook forwarding:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

What the app does with Stripe:

- Signed-in users can start Checkout from the dashboard header or locked Pro callouts.
- Stripe webhooks update Clerk metadata for the user.
- Pro access is granted from Clerk metadata, with the old user allowlist still working as a fallback.

Before testing locally:

1. Create a recurring test-mode Price in Stripe and copy its `price_...` ID into `STRIPE_PRICE_ID_PRO_MONTHLY`.
2. Start the Next.js app with `npm run dev`.
3. Start the Stripe CLI listener and copy the emitted `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.
4. Sign into the app with a Clerk user, click `Go Pro`, and complete Checkout with a Stripe test card.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
