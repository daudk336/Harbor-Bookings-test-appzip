import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import {
  auditLogTable,
  attachmentsTable,
  bookingsTable,
  db,
  reviewsTable,
  servicesTable,
} from "@workspace/db";
import {
  CancelBookingParams,
  CancelBookingResponse,
  CreateBookingAttachmentBody,
  CreateBookingAttachmentParams,
  CreateBookingAttachmentResponse,
  CreateBookingBody,
  CreateBookingResponse,
  CreateDepositCheckoutParams,
  CreateDepositCheckoutResponse,
  GetAdminActivityResponse,
  GetAdminStatsResponse,
  GetCurrentUserRoleResponse,
  GetServiceParams,
  GetServiceResponse,
  GetStaffCalendarResponse,
  ListAdminBookingsResponse,
  ListBookingAttachmentsParams,
  ListBookingAttachmentsResponse,
  ListMyBookingsResponse,
  ListRecentReviewsResponse,
  ListServicesResponse,
  RequestAttachmentUploadUrlBody,
  RequestAttachmentUploadUrlParams,
  RequestAttachmentUploadUrlResponse,
  RequestServiceImageUploadUrlBody,
  RequestServiceImageUploadUrlParams,
  RequestServiceImageUploadUrlResponse,
  SummarizeRecentReviewsResponse,
  UpdateServiceImageBody,
  UpdateServiceImageParams,
  UpdateServiceImageResponse,
} from "@workspace/api-zod";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClerkClient } from "@clerk/backend";
import { currentUserId, audit, requireRole, roleForUser } from "../lib/harbor-auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { setObjectAclPolicy } from "../lib/objectAcl";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const connectors = new ReplitConnectors();
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function bookingViews(userId?: string) {
  const query = db
    .select({
      id: bookingsTable.id,
      serviceId: bookingsTable.serviceId,
      customerUserId: bookingsTable.customerUserId,
      status: bookingsTable.status,
      startsAt: bookingsTable.startsAt,
      notes: bookingsTable.notes,
      metadata: bookingsTable.metadata,
      createdAt: bookingsTable.createdAt,
      serviceName: servicesTable.name,
      servicePriceCents: servicesTable.priceCents,
      serviceDurationMinutes: servicesTable.durationMinutes,
      customerEmail: sql<null>`null`,
      customerName: sql<string>`'Harbor guest'`,
    })
    .from(bookingsTable)
    .innerJoin(servicesTable, eq(bookingsTable.serviceId, servicesTable.id));
  return userId
    ? query.where(eq(bookingsTable.customerUserId, userId)).orderBy(desc(bookingsTable.startsAt))
    : query.orderBy(desc(bookingsTable.startsAt));
}

async function canManageBooking(
  bookingId: number,
  userId: string,
): Promise<boolean> {
  const role = await roleForUser(userId);
  if (role === "admin") return true;
  const [booking] = await db
    .select({ customerUserId: bookingsTable.customerUserId })
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));
  return booking?.customerUserId === userId;
}

router.get("/me", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const role = await roleForUser(userId);
  res.json(GetCurrentUserRoleResponse.parse({ userId, role }));
});

router.get("/services", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.isActive, true))
    .orderBy(servicesTable.category, servicesTable.name);
  res.json(ListServicesResponse.parse(rows));
});

router.get("/services/:serviceId", async (req, res): Promise<void> => {
  const params = GetServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid service id" });
    return;
  }
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, params.data.serviceId), eq(servicesTable.isActive, true)));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  res.json(GetServiceResponse.parse(service));
});

router.post("/bookings", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, parsed.data.serviceId), eq(servicesTable.isActive, true)));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const start = new Date(parsed.data.startsAt);
  if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now()) {
    res.status(400).json({ error: "Choose a future appointment time" });
    return;
  }
  const [booking] = await db
    .insert(bookingsTable)
    .values({
      serviceId: service.id,
      customerUserId: userId,
      startsAt: start,
      notes: parsed.data.notes ?? null,
      status: "pending",
      metadata: {},
    })
    .returning();
  await audit(userId, "booking.created", { bookingId: booking.id, serviceId: service.id });
  res.status(201).json(CreateBookingResponse.parse(booking));
});

router.get("/bookings/mine", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const rows = await bookingViews(userId);
  res.json(ListMyBookingsResponse.parse(rows));
});

router.post("/bookings/:bookingId/cancel", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const params = CancelBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  if (!(await canManageBooking(params.data.bookingId, userId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.status === "completed" || booking.status === "cancelled") {
    res.status(409).json({ error: "This booking cannot be cancelled" });
    return;
  }
  const [updated] = await db
    .update(bookingsTable)
    .set({ status: "cancelled" })
    .where(eq(bookingsTable.id, booking.id))
    .returning();
  await audit(userId, "booking.cancelled", { bookingId: booking.id });
  res.json(CancelBookingResponse.parse(updated));
});

router.post("/bookings/:bookingId/deposit-checkout", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const params = CreateDepositCheckoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  if (!(await canManageBooking(params.data.bookingId, userId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const [booking] = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      serviceName: servicesTable.name,
      priceCents: servicesTable.priceCents,
    })
    .from(bookingsTable)
    .innerJoin(servicesTable, eq(bookingsTable.serviceId, servicesTable.id))
    .where(eq(bookingsTable.id, params.data.bookingId));
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  if (booking.status === "cancelled" || booking.status === "completed") {
    res.status(409).json({ error: "This booking cannot be paid" });
    return;
  }
  const origin = `${req.protocol}://${req.get("host")}`;
  const depositCents = Math.max(500, Math.round(booking.priceCents * 0.25));
  const fields = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "cad",
    "line_items[0][price_data][unit_amount]": String(depositCents),
    "line_items[0][price_data][product_data][name]": `${booking.serviceName} deposit`,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/my-bookings?payment=success`,
    cancel_url: `${origin}/my-bookings?payment=cancelled`,
    client_reference_id: String(booking.id),
    "metadata[bookingId]": String(booking.id),
  });
  try {
    let checkoutUrl: string | null | undefined;
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const created = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "cad",
            unit_amount: depositCents,
            product_data: { name: `${booking.serviceName} deposit` },
          },
          quantity: 1,
        }],
        success_url: `${origin}/my-bookings?payment=success`,
        cancel_url: `${origin}/my-bookings?payment=cancelled`,
        client_reference_id: String(booking.id),
        metadata: { bookingId: String(booking.id) },
      });
      checkoutUrl = created.url;
    } else {
      const response = await connectors.proxy("stripe", "/v1/checkout/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: fields.toString(),
      });
      if (!response.ok) throw new Error("Stripe is not configured");
      checkoutUrl = (await response.json() as { url?: string }).url;
    }
    if (!checkoutUrl) throw new Error("Checkout session URL missing");
    res.json(CreateDepositCheckoutResponse.parse({ checkoutUrl }));
  } catch (error) {
    req.log.warn({ err: error }, "Stripe checkout is not available");
    res.status(503).json({ error: "Not set up yet" });
  }
});

router.get("/bookings/:bookingId/attachments", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const params = ListBookingAttachmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }
  if (!(await canManageBooking(params.data.bookingId, userId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const rows = await db
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.bookingId, params.data.bookingId))
    .orderBy(desc(attachmentsTable.createdAt));
  res.json(ListBookingAttachmentsResponse.parse(rows));
});

router.post("/bookings/:bookingId/attachments/upload-url", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const params = RequestAttachmentUploadUrlParams.safeParse(req.params);
  const body = RequestAttachmentUploadUrlBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid upload request" });
    return;
  }
  if (!(await canManageBooking(params.data.bookingId, userId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  res.json(RequestAttachmentUploadUrlResponse.parse({ uploadURL, objectPath }));
});

router.post("/bookings/:bookingId/attachments", async (req, res): Promise<void> => {
  const userId = await currentUserId(req, res);
  if (!userId) return;
  const params = CreateBookingAttachmentParams.safeParse(req.params);
  const body = CreateBookingAttachmentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid attachment" });
    return;
  }
  if (!(await canManageBooking(params.data.bookingId, userId))) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  if (!body.data.fileUrl.startsWith("/objects/")) {
    res.status(400).json({ error: "Invalid object path" });
    return;
  }
  const objectFile = await storage.getObjectEntityFile(body.data.fileUrl);
  await setObjectAclPolicy(objectFile, {
    owner: userId,
    visibility: "private",
  });
  const [attachment] = await db
    .insert(attachmentsTable)
    .values({
      bookingId: params.data.bookingId,
      fileUrl: body.data.fileUrl,
      fileName: body.data.fileName,
      uploadedBy: userId,
    })
    .returning();
  await audit(userId, "booking.attachment_uploaded", {
    bookingId: params.data.bookingId,
    attachmentId: attachment.id,
  });
  res.status(201).json(CreateBookingAttachmentResponse.parse(attachment));
});

router.get("/staff/calendar", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["staff", "admin"]);
  if (!userId) return;
  const rows = await bookingViews();
  res.json(GetStaffCalendarResponse.parse(rows.slice(0, 100)));
});

router.get("/admin/bookings", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["admin"]);
  if (!userId) return;
  const rows = await bookingViews();
  res.json(ListAdminBookingsResponse.parse(rows));
});

router.get("/admin/stats", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["admin"]);
  if (!userId) return;
  const bookings = await db.select({ status: bookingsTable.status }).from(bookingsTable);
  const reviews = await db
    .select({
      average: sql<number>`coalesce(avg(${reviewsTable.rating}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(reviewsTable);
  const values = bookings.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const stats = {
    total: bookings.length,
    pending: values.pending ?? 0,
    confirmed: values.confirmed ?? 0,
    cancelled: values.cancelled ?? 0,
    completed: values.completed ?? 0,
    averageRating: Number(reviews[0]?.average ?? 0),
    reviewCount: Number(reviews[0]?.count ?? 0),
  };
  res.json(GetAdminStatsResponse.parse(stats));
});

router.get("/admin/activity", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["admin"]);
  if (!userId) return;
  const rows = await db
    .select()
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(20);
  res.json(GetAdminActivityResponse.parse(rows));
});

router.get("/admin/reviews/recent", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["admin"]);
  if (!userId) return;
  const rows = await db
    .select({
      id: reviewsTable.id,
      bookingId: reviewsTable.bookingId,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      createdAt: reviewsTable.createdAt,
      serviceName: servicesTable.name,
    })
    .from(reviewsTable)
    .innerJoin(bookingsTable, eq(reviewsTable.bookingId, bookingsTable.id))
    .innerJoin(servicesTable, eq(bookingsTable.serviceId, servicesTable.id))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(20);
  res.json(ListRecentReviewsResponse.parse(rows));
});

router.post("/admin/reviews/summary", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["admin"]);
  if (!userId) return;
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({ error: "Not set up yet" });
    return;
  }
  const rows = await db
    .select({ rating: reviewsTable.rating, comment: reviewsTable.comment })
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.createdAt))
    .limit(20);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      max_completion_tokens: 8192,
      messages: [
        {
          role: "system",
          content: "Summarize customer feedback in 3 concise sentences. Use only the supplied fictional test reviews.",
        },
        { role: "user", content: JSON.stringify(rows) },
      ],
    }),
  });
  if (!response.ok) {
    res.status(502).json({ error: "AI summary could not be generated" });
    return;
  }
  const result = await response.json() as {
    choices?: { message?: { content?: string | null } }[];
  };
  res.json(
    SummarizeRecentReviewsResponse.parse({
      summary: result.choices?.[0]?.message?.content ?? "No review summary available.",
      reviewCount: rows.length,
    }),
  );
});

router.post("/admin/services/:serviceId/image-upload/upload-url", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["admin"]);
  if (!userId) return;
  const params = RequestServiceImageUploadUrlParams.safeParse(req.params);
  const body = RequestServiceImageUploadUrlBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid upload request" });
    return;
  }
  const [service] = await db
    .select({ id: servicesTable.id })
    .from(servicesTable)
    .where(eq(servicesTable.id, params.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const searchPath = storage.getPublicObjectSearchPaths()[0];
  const segments = searchPath.replace(/^\/+/, "").split("/");
  const bucketName = segments.shift();
  if (!bucketName) {
    res.status(500).json({ error: "Public storage is not configured" });
    return;
  }
  const fileName = body.data.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectName = [...segments, "service-images", `${crypto.randomUUID()}-${fileName}`]
    .filter(Boolean)
    .join("/");
  const { objectStorageClient } = await import("../lib/objectStorage");
  const [uploadURL] = await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType: body.data.contentType,
    });
  const objectPath = `/service-images/${objectName.split("/").pop()}`;
  res.json(RequestServiceImageUploadUrlResponse.parse({ uploadURL, objectPath }));
});

router.put("/admin/services/:serviceId/image", async (req, res): Promise<void> => {
  const userId = await requireRole(req, res, ["admin"]);
  if (!userId) return;
  const params = UpdateServiceImageParams.safeParse(req.params);
  const body = UpdateServiceImageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid service image" });
    return;
  }
  const image = UpdateServiceImageBody.safeParse(body.data);
  if (!image.success || !image.data.imageUrl.startsWith("/api/storage/public-objects/")) {
    res.status(400).json({ error: "Service images must use public App Storage" });
    return;
  }
  const [service] = await db
    .update(servicesTable)
    .set({ imageUrl: image.data.imageUrl })
    .where(eq(servicesTable.id, params.data.serviceId))
    .returning();
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  await audit(userId, "service.image_updated", { serviceId: service.id });
  res.json(UpdateServiceImageResponse.parse(service));
});

router.post("/stripe/webhook", async (req, res): Promise<void> => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];
  if (!secret || typeof signature !== "string") {
    res.status(503).json({ error: "Not set up yet" });
    return;
  }
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch (error) {
    req.log.warn({ err: error }, "Rejected invalid Stripe webhook signature");
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = Number(session.metadata?.bookingId ?? session.client_reference_id);
    if (Number.isSafeInteger(bookingId) && bookingId > 0) {
      const [booking] = await db
        .update(bookingsTable)
        .set({ status: "confirmed" })
        .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "pending")))
        .returning();
      if (booking) {
        await sendBookingConfirmation(booking.customerUserId, booking.id, booking.startsAt);
        await audit("stripe_webhook", "booking.confirmed", { bookingId });
      }
    }
  }
  res.json({ received: true });
});

async function sendBookingConfirmation(userId: string, bookingId: number, startsAt: Date) {
  try {
    const user = await clerk.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return;
    const payload = {
      from: "Harbor Bookings <onboarding@resend.dev>",
      to: [email],
      subject: "Your Harbor Bookings appointment is confirmed",
      html: `<p>Your appointment #${bookingId} is confirmed.</p><p>Starts: ${startsAt.toISOString()}</p>`,
    };
    if (process.env.RESEND_API_KEY) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Resend request failed");
      return;
    }
    const response = await connectors.proxy("resend", "/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("Resend request failed");
  } catch (error) {
    // Payment confirmation is durable even if email delivery is temporarily unavailable.
    const { logger } = await import("../lib/logger");
    logger.warn({ err: error, bookingId }, "Booking confirmation email was not sent");
  }
}

export default router;
