import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { attachmentsTable, bookingsTable, db } from "@workspace/db";
import { currentUserId, roleForUser } from "../lib/harbor-auth";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

async function pipeStoredFile(
  res: Response,
  file: Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>>,
): Promise<void> {
  const response = await storage.downloadObject(file);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
}

router.get(
  "/storage/public-objects/*objectPath",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.params.objectPath;
      const objectPath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await storage.searchPublicObject(objectPath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      await pipeStoredFile(res, file);
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

router.get(
  "/storage/objects/*objectPath",
  async (req: Request, res: Response): Promise<void> => {
    const userId = await currentUserId(req, res);
    if (!userId) return;
    const raw = req.params.objectPath;
    const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
    try {
      const [attachment] = await db
        .select({
          fileUrl: attachmentsTable.fileUrl,
          customerUserId: bookingsTable.customerUserId,
        })
        .from(attachmentsTable)
        .innerJoin(bookingsTable, eq(attachmentsTable.bookingId, bookingsTable.id))
        .where(eq(attachmentsTable.fileUrl, objectPath));
      const role = await roleForUser(userId);
      if (!attachment || (attachment.customerUserId !== userId && role !== "admin")) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      const file = await storage.getObjectEntityFile(objectPath);
      await pipeStoredFile(res, file);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving private object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

export default router;
