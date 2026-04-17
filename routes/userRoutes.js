import { Router } from "express";
import { getCredits, purchase } from "../controllers/userController.js";

const router = Router();

router.get("/credits", getCredits);
router.post("/credits/purchase", purchase);

export default router;
