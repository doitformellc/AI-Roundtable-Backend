import { Router } from "express";
import { handleClerkWebhook } from "../controllers/webhookController.js";

const router = Router();

router.post("/clerk", handleClerkWebhook);

export default router;
