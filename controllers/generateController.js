import {
  refineArticleBlock,
  runRoundtableGeneration
} from "../services/roundtableService.js";

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function generateArticle(req, res) {
  const {
    topic,
    category = "Homework",
    segment = "Undergraduate",
    providers,
    intent = "Research",
    length = "Medium",
    tonality = "Academic"
  } =
    req.body;

  if (!topic) {
    return res.status(400).json({ error: "Topic is required." });
  }

  try {
    const result = await runRoundtableGeneration({
      clerkId: req.user.clerk_id,
      topic,
      category,
      segment,
      providers,
      intent,
      length,
      tonality
    });

    return res.json({
      ...result,
      estimatedCreditsUsed: 1
    });
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS") {
      return res.status(402).json({ error: error.message });
    }

    if (error.code === "PROVIDER_DRAFT_FAILURE") {
      return res.status(503).json({
        error: error.message,
        providerFailures: error.details || []
      });
    }

    if (error.code === "CONSENSUS_REJECTED") {
      return res.status(422).json({
        error: error.message,
        consensusAttempts: error.details || []
      });
    }

    return res.status(500).json({
      error: error.message,
      providerFailures: error.details || []
    });
  }
}

export async function streamGenerateArticle(req, res) {
  const {
    topic,
    category = "Homework",
    segment = "Undergraduate",
    providers,
    intent = "Research",
    length = "Medium",
    tonality = "Academic"
  } =
    req.body;

  if (!topic) {
    return res.status(400).json({ error: "Topic is required." });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  writeSse(res, "roundtable", {
    type: "stream-open",
    stage: "init",
    message: "Live roundtable stream connected."
  });

  try {
    const result = await runRoundtableGeneration({
      clerkId: req.user.clerk_id,
      topic,
      category,
      segment,
      providers,
      intent,
      length,
      tonality,
      onEvent(event) {
        writeSse(res, "roundtable", event);
      }
    });

    writeSse(res, "complete", {
      type: "complete",
      stage: "complete",
      message: "Roundtable consensus completed.",
      result: {
        ...result,
        estimatedCreditsUsed: 1
      }
    });
  } catch (error) {
    writeSse(res, "error", {
      type: "error",
      stage: error.code || "generation-error",
      message: error.message,
      providerFailures: error.details || []
    });
  } finally {
    res.end();
  }
}

export async function refineArticle(req, res) {
  const { articleId, blockId, instruction } = req.body;

  if (!articleId || !blockId || !instruction) {
    return res.status(400).json({
      error: "articleId, blockId, and instruction are required."
    });
  }

  try {
    const result = await refineArticleBlock({
      clerkId: req.user.clerk_id,
      articleId,
      blockId,
      instruction
    });

    return res.json({
      ...result,
      estimatedCreditsUsed: 1
    });
  } catch (error) {
    if (error.code === "INSUFFICIENT_CREDITS") {
      return res.status(402).json({ error: error.message });
    }

    if (error.code === "CONSENSUS_REJECTED") {
      return res.status(422).json({
        error: error.message,
        consensusAttempts: error.details || []
      });
    }

    return res.status(500).json({
      error: error.message,
      providerFailures: error.details || []
    });
  }
}
