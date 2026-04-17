import { getArticleById, getUserSnapshot } from "../services/roundtableService.js";

export function getArticle(req, res) {
  const article = getArticleById(req.params.id, req.user.clerk_id);

  if (!article) {
    return res.status(404).json({ error: "Article not found" });
  }

  return res.json(article);
}

export function listArticles(req, res) {
  const snapshot = getUserSnapshot(req.user.clerk_id);
  return res.json({ articles: snapshot.articles });
}
