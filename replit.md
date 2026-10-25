# Harbor Bookings

A fictional appointment-booking app with customer, staff, and administrator areas for migration testing.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/harbor-bookings run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed:harbor` — safely seed fictional demo data and development test users
- Required env: `DATABASE_URL` — Postgres connection string
- Optional provider secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `OPENAI_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/harbor-bookings` — React + Vite web app
- `artifacts/api-server` — Express API, authentication middleware, and storage routes
- `lib/db/src/schema/harbor.ts` — Drizzle tables and enums
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `scripts/src/seed-harbor.ts` — idempotent development seed script

## Architecture decisions

- Clerk authenticates users; app roles are stored and enforced in PostgreSQL.
- Booking uploads are private objects; service images are public objects.
- Stripe and Resend use the exact secret names listed in the README, with connected integrations as a secure fallback.

## Product

Customers can browse services, book and manage appointments, pay a deposit, and attach files. Staff can view the schedule. Administrators can review bookings, stats, activity, customer feedback, and service imagery.

## User preferences

- Use fake data only; never seed real people or customer data.

## Gotchas

- Keep `/api/healthz` and regenerate API client/Zod code whenever the OpenAPI spec changes.
- Run the database push before the seed command.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
