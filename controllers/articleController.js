import { getArticleById, getUserSnapshot } from "../services/roundtableService.js";

export async function getArticle(req, res) {
  try {
    const article = await getArticleById(req.params.id, req.user.clerk_id);

    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }

    return res.json(article);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export async function listArticles(req, res) {
  try {
    const snapshot = await getUserSnapshot(req.user.clerk_id);
    return res.json({ articles: snapshot.articles });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
