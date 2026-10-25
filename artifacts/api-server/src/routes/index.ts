import { Router, type IRouter } from "express";
import healthRouter from "./health";
import harborRouter from "./harbor";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(harborRouter);
router.use(storageRouter);

export default router;
