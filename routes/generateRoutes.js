import { Router } from "express";
import {
  generateArticle,
  refineArticle,
  streamGenerateArticle
} from "../controllers/generateController.js";

const router = Router();

router.post("/generate", generateArticle);
router.post("/generate/stream", streamGenerateArticle);
router.post("/generate/refine", refineArticle);

export default router;
