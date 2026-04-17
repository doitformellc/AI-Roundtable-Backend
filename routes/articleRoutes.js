import { Router } from "express";
import { getArticle, listArticles } from "../controllers/articleController.js";

const router = Router();

router.get("/", listArticles);
router.get("/:id", getArticle);

export default router;
