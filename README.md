# Harbor Bookings

A fictional harbor-side booking studio used to exercise application migrations. All seeded service, booking, review, and customer data is synthetic.

## Run and seed

The workspace's API and web workflows can be started from Replit.

```bash
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed:harbor
pnpm run typecheck
```

The seed command is safe to rerun. It provisions five Clerk development test accounts and fills the database to 12 services, 60 bookings, 30 reviews, 10 private sample attachments, and 40 audit events. Test credentials are in `TEST_USERS.md`; they are for the development instance only.

## Secrets

- `DATABASE_URL`
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `PRIVATE_OBJECT_DIR`
- `PUBLIC_OBJECT_SEARCH_PATHS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`

## Optional integrations

If an optional provider credential is absent, the related app feature reports “Not set up yet”. Stripe checkout accepts test-mode keys only. Clerk and App Storage configuration are managed by Replit.

## File storage

Booking attachments use private App Storage objects and are only served to the booking owner or an administrator. Service images use the public service-images path.

## Database

Drizzle schema source: `lib/db/src/schema/harbor.ts`. SQL migrations are checked in under `lib/db/drizzle/`. API contracts are maintained in `lib/api-spec/openapi.yaml`.

For a new, empty database, run `pnpm --filter @workspace/db run migrate`, then run the seed command. The existing development database was initialized with Drizzle push; do not apply the initial migration over its already-created tables.
