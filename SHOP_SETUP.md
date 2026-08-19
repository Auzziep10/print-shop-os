# Brand Shop — one-time setup

The shop code is fully wired, but Firestore security rules must allow the new
collections. Until then the public store can't read products and checkout
can't record orders.

## 1. Firestore rules (required)

Firebase Console → print-shop-os-f8092 → Firestore Database → Rules → add these
match blocks inside `match /databases/{database}/documents { ... }`, then Publish:

```
    // ---- Brand Shop (public merch store at /shop) ----
    match /shop_products/{productId} {
      allow read: if true;                 // public storefront
      allow write: if request.auth != null; // admins manage via Settings → Brand Shop
    }
    match /shop_orders/{orderId} {
      allow create: if true;               // checkout writes a pending order
      // The buyer's browser marks its own order paid after Stripe confirms.
      // Only pending orders can be touched without auth; paid/fulfilled are locked.
      allow update: if request.auth != null || resource.data.status == 'pending';
      allow read, delete: if request.auth != null;
    }
```

The store also reads `settings/brandShop`. If your existing rules already allow
public reads on the `settings` collection (the landing page reads
`settings/storefront` publicly), nothing more is needed. Otherwise add:

```
    match /settings/brandShop {
      allow read: if true;
      allow write: if request.auth != null;
    }
```

## 2. Storage rules (only if uploads fail)

Product/banner images upload to `shop_media/**` in Firebase Storage from the
admin tab (authenticated). If your Storage rules whitelist specific folders,
mirror whatever `storefront_media/**` uses for `shop_media/**`. Public read is
required (product images are shown on the public store and sent to Stripe).

## 3. Stripe

No new keys needed — `api/stripe/shop-checkout.ts` uses the existing
`STRIPE_SECRET_KEY` env var on Vercel. Orders are verified on the success page
via the same key.

Note: Vercel Hobby allows 12 serverless functions; this repo is now at exactly
12. The next endpoint added will need a merge or an upgrade.

## What was added (all additive)

- `/shop` — public storefront (NM Original look), `/shop/success` — order confirmation
- `src/pages/Shop/` — ShopPage, ShopSuccess, useCart, shopTypes, shop.css
- `src/pages/Settings/ShopManagerTab.tsx` — Settings → Brand Shop (Products / Storefront / Orders)
- `api/stripe/shop-checkout.ts` — Stripe Checkout create + verify (one function)
- "Shop" link in the landing page nav
- Firestore: `shop_products`, `shop_orders` collections + `settings/brandShop` doc
