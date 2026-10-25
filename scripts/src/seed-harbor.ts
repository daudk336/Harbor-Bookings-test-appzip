import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";
import { Storage } from "@google-cloud/storage";
import {
  attachmentsTable,
  auditLogTable,
  bookingsTable,
  db,
  reviewsTable,
  servicesTable,
  userRolesTable,
} from "@workspace/db";
import { count, eq } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

const sidecar = "http://127.0.0.1:1106";
const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: {
      url: `${sidecar}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const accountsPath = path.resolve(import.meta.dirname, "../../TEST_USERS.md");
const roles = ["admin", "staff", "customer", "customer", "customer"] as const;
const emails = [
  "harbor.admin@example.com",
  "harbor.staff@example.com",
  "harbor.customer.one@example.com",
  "harbor.customer.two@example.com",
  "harbor.customer.three@example.com",
];

async function loadOrCreateTestUsers() {
  let markdown: string;
  try {
    markdown = await readFile(accountsPath, "utf8");
  } catch {
    const rows = roles.map((role, index) => ({
      role,
      email: emails[index]!,
      password: `${randomBytes(20).toString("base64url")}!H${index + 1}`,
    }));
    markdown = [
      "# Harbor Bookings development test accounts",
      "",
      "These are synthetic accounts in the Clerk development instance only. Do not reuse these credentials or publish this file.",
      "",
      "| Role | Email | Password |",
      "| --- | --- | --- |",
      ...rows.map((row) => `| ${row.role} | ${row.email} | ${row.password} |`),
      "",
    ].join("\n");
    await writeFile(accountsPath, markdown, { mode: 0o600 });
  }

  const rows = [...markdown.matchAll(/^\|\s*(admin|staff|customer)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|$/gm)];
  if (rows.length !== 5) {
    throw new Error("TEST_USERS.md must contain exactly five test accounts");
  }
  return rows.map((row) => ({
    role: row[1] as (typeof roles)[number],
    email: row[2]!.trim(),
    password: row[3]!.trim(),
  }));
}

const client = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function seedUsers() {
  const credentials = await loadOrCreateTestUsers();
  const result: { userId: string; role: (typeof roles)[number]; email: string }[] = [];
  for (const account of credentials) {
    const existing = await client.users.getUserList({
      emailAddress: [account.email],
      limit: 1,
    });
    const user = existing.data[0] ?? await client.users.createUser({
      emailAddress: [account.email],
      password: account.password,
      skipPasswordRequirement: false,
      publicMetadata: { harborRole: account.role },
    });
    await db
      .insert(userRolesTable)
      .values({ userId: user.id, role: account.role })
      .onConflictDoNothing();
    result.push({ userId: user.id, role: account.role, email: account.email });
  }
  return result;
}

const serviceSeeds = [
  ["Quiet Tide Massage", "A restorative full-body massage shaped around your needs.", 9500, 60, "wellness"],
  ["Harbor Light Facial", "A gentle, hydrating facial with marine botanicals.", 7800, 50, "wellness"],
  ["Salt Room Reset", "A guided breath and salt-room relaxation session.", 5500, 40, "wellness"],
  ["Sound Bath at Dusk", "Settle into a restorative sound meditation by the water.", 4200, 45, "wellness"],
  ["One-to-One Coaching", "A focused coaching session for your next step.", 12000, 60, "coaching"],
  ["Career Compass", "Clarify your direction with practical coaching exercises.", 13500, 75, "coaching"],
  ["Mindful Leadership", "Build a calmer, more intentional leadership practice.", 15000, 75, "coaching"],
  ["Creative Clarity Session", "Find space for fresh ideas and a practical plan.", 11000, 60, "coaching"],
  ["Weekend Watercolor", "A relaxed introductory watercolor workshop.", 6800, 120, "workshop"],
  ["Candlelight Journaling", "A small-group guided journaling evening.", 3500, 90, "workshop"],
  ["Coastal Breathwork", "Learn breathing techniques for rest and focus.", 4900, 75, "workshop"],
  ["Seasonal Reset Circle", "A supportive small-group workshop to reset routines.", 5900, 90, "workshop"],
] as const;

async function seedServices() {
  const existing = await db.select({ id: servicesTable.id, name: servicesTable.name }).from(servicesTable);
  const names = new Set(existing.map((row) => row.name));
  const missing = serviceSeeds
    .filter(([name]) => !names.has(name))
    .map(([name, description, priceCents, durationMinutes, category]) => ({
      name,
      description,
      priceCents,
      durationMinutes,
      category: category as "wellness" | "coaching" | "workshop",
      isActive: true,
    }));
  if (missing.length) await db.insert(servicesTable).values(missing);
  return db.select({ id: servicesTable.id }).from(servicesTable).orderBy(servicesTable.id);
}

function makePdf() {
  const stream = "BT /F1 18 Tf 72 720 Td (Harbor Bookings test attachment) Tj 0 -28 Td (Synthetic sample document for migration testing.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

function sampleSvg(index: number) {
  const palettes = [
    ["#0e4d59", "#9bd2c8"], ["#183d52", "#f3cf9a"], ["#335f74", "#e2aa84"],
    ["#315d59", "#c1d8a9"], ["#41546b", "#f0c4b4"],
  ];
  const [deep, light] = palettes[index % palettes.length]!;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${deep}"/><stop offset="1" stop-color="${light}"/></linearGradient></defs><rect width="960" height="640" rx="36" fill="url(#g)"/><circle cx="${180 + index * 13}" cy="180" r="112" fill="#fff" opacity=".18"/><path d="M0 460Q190 380 380 470t380 0 200-5v175H0z" fill="#062d3a" opacity=".42"/><text x="64" y="560" fill="white" font-family="sans-serif" font-size="28">HARBOR BOOKINGS · SAMPLE ${String(index + 1).padStart(2, "0")}</text></svg>`);
}

function splitStoragePath(raw: string) {
  const parts = raw.replace(/^\/+/, "").split("/");
  const bucket = parts.shift();
  if (!bucket) throw new Error("Invalid App Storage path");
  return { bucket, object: parts.join("/") };
}

async function uploadSample(userId: string, index: number) {
  const base = process.env.PRIVATE_OBJECT_DIR;
  if (!base) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const { bucket, object } = splitStoragePath(`${base}/uploads/harbor-sample-${String(index + 1).padStart(2, "0")}.${index === 9 ? "pdf" : "svg"}`);
  const name = `harbor-sample-${String(index + 1).padStart(2, "0")}.${index === 9 ? "pdf" : "svg"}`;
  const file = objectStorageClient.bucket(bucket).file(object);
  const bytes = index === 9 ? makePdf() : sampleSvg(index);
  await file.save(bytes, {
    resumable: false,
    metadata: { contentType: index === 9 ? "application/pdf" : "image/svg+xml" },
  });
  await file.setMetadata({
    metadata: {
      "custom:aclPolicy": JSON.stringify({
        owner: userId,
        visibility: "private",
      }),
    },
  });
  return { name, fileUrl: `/objects/${object.replace(/^.*?\/uploads\//, "uploads/")}` };
}

async function countRows(table: AnyPgTable) {
  const [row] = await db.select({ value: count() }).from(table);
  return Number(row?.value ?? 0);
}

async function seed() {
  const testUsers = await seedUsers();
  const services = await seedServices();
  let bookingCount = await countRows(bookingsTable);
  if (bookingCount < 60) {
    const additions = Array.from({ length: 60 - bookingCount }, (_, offset) => {
      const i = bookingCount + offset;
      const customer = testUsers[2 + (i % 3)]!;
      const dayOffset = (i % 35) - 10;
      return {
        serviceId: services[i % services.length]!.id,
        customerUserId: customer.userId,
        status: (["pending", "confirmed", "cancelled", "completed"] as const)[i % 4],
        startsAt: new Date(Date.now() + dayOffset * 86_400_000 + (9 + (i % 8)) * 3_600_000),
        notes: i % 3 === 0 ? "Please allow a few minutes to settle in." : null,
        metadata: { source: "seed", sampleIndex: i + 1 },
      };
    });
    await db.insert(bookingsTable).values(additions);
    bookingCount += additions.length;
  }
  const bookings = await db.select({ id: bookingsTable.id }).from(bookingsTable).orderBy(bookingsTable.id);

  let reviewCount = await countRows(reviewsTable);
  if (reviewCount < 30) {
    const comments = [
      "A thoughtful and welcoming session. I left feeling grounded.",
      "Clear guidance, a peaceful space, and useful takeaways.",
      "The instructor made everything easy to follow.",
      "Exactly the reset I needed after a busy week.",
      "Warm, professional, and never rushed.",
      "A lovely experience from start to finish.",
    ];
    const additions = Array.from({ length: 30 - reviewCount }, (_, offset) => {
      const i = reviewCount + offset;
      return {
        bookingId: bookings[i % bookings.length]!.id,
        rating: 3 + (i % 3),
        comment: comments[i % comments.length]!,
        createdAt: new Date(Date.now() - i * 86_400_000),
      };
    });
    await db.insert(reviewsTable).values(additions);
    reviewCount += additions.length;
  }

  let attachmentCount = await countRows(attachmentsTable);
  if (attachmentCount < 10) {
    const existingAttachments = await db.select({ id: attachmentsTable.id }).from(attachmentsTable);
    for (let i = attachmentCount; i < 10; i++) {
      const bookingIndex = (i * 5) % bookings.length;
      const booking = bookings[bookingIndex]!;
      const bookingRow = await db
        .select({ customerUserId: bookingsTable.customerUserId })
        .from(bookingsTable)
        .where(eq(bookingsTable.id, booking.id));
      const uploaded = await uploadSample(bookingRow[0]!.customerUserId, i);
      await db.insert(attachmentsTable).values({
        bookingId: booking.id,
        fileUrl: uploaded.fileUrl,
        fileName: uploaded.name,
        uploadedBy: bookingRow[0]!.customerUserId,
      });
    }
    attachmentCount = existingAttachments.length + (10 - existingAttachments.length);
  }

  let auditCount = await countRows(auditLogTable);
  if (auditCount < 40) {
    const additions = Array.from({ length: 40 - auditCount }, (_, offset) => ({
      actorUserId: testUsers[offset % testUsers.length]!.userId,
      action: ["booking.created", "booking.confirmed", "booking.cancelled", "review.received"][offset % 4]!,
      details: { source: "seed", sampleIndex: auditCount + offset + 1 },
      createdAt: new Date(Date.now() - offset * 3_600_000),
    }));
    await db.insert(auditLogTable).values(additions);
    auditCount += additions.length;
  }
  process.stdout.write(JSON.stringify({
    services: services.length,
    bookings: bookingCount,
    reviews: reviewCount,
    attachments: attachmentCount,
    auditEvents: auditCount,
    testUsers: testUsers.map(({ role, email }) => ({ role, email })),
  }, null, 2) + "\n");
}

void seed()
  .then(async () => {
    await db.$client.end();
  })
  .catch(async (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    await db.$client.end();
    process.exitCode = 1;
  });
