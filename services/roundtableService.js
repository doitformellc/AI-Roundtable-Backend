import { v4 as uuidv4 } from "uuid";
import { readDb, writeDb } from "../data/database.js";
import {
  critiqueDrafts,
  generateProviderDraft,
  getAvailableProviders,
  getEnabledProviderIds,
  judgeConsensus,
  reviseDraft
} from "./providerService.js";

const defaultProviderOrder = ["openai", "gemini_flash", "gemini_flash_lite"];
const DEFAULT_CREDITS = 10;
const CONSENSUS_THRESHOLD = 90;
const MAX_CONSENSUS_ATTEMPTS = 2;

function normalizeControls({ intent = "Research", length = "Medium", tonality = "Academic" } = {}) {
  return { intent, length, tonality };
}

function pickProviders(requestedProviders = []) {
  const enabledProviders = getEnabledProviderIds();
  const cleaned = requestedProviders.filter(
    (providerId) => Boolean(providerId) && enabledProviders.includes(providerId)
  );
  if (cleaned.length >= 3) {
    return [...new Set(cleaned)].slice(0, 3);
  }

  const merged = [...cleaned];
  for (const provider of defaultProviderOrder) {
    if (enabledProviders.includes(provider) && !merged.includes(provider)) {
      merged.push(provider);
    }
    if (merged.length === 3) {
      break;
    }
  }

  return merged;
}

export function listProviderMetadata() {
  return getAvailableProviders();
}

export function findUserByClerkId(clerkId) {
  const db = readDb();
  return db.users.find((entry) => entry.clerk_id === clerkId);
}

export function syncClerkUser({ clerkId, email, firstName = "", lastName = "" }) {
  const db = readDb();
  let user = db.users.find((entry) => entry.clerk_id === clerkId);

  if (!user) {
    user = {
      id: uuidv4(),
      clerk_id: clerkId,
      email,
      first_name: firstName,
      last_name: lastName,
      credit_balance: DEFAULT_CREDITS
    };
    db.users.push(user);
    db.transactions.push({
      id: uuidv4(),
      user_id: user.id,
      amount: 0,
      credits_added: DEFAULT_CREDITS,
      timestamp: new Date().toISOString()
    });
  } else {
    user.email = email || user.email;
    user.first_name = firstName || user.first_name || "";
    user.last_name = lastName || user.last_name || "";
  }

  writeDb(db);
  return user;
}

export function deleteClerkUser(clerkId) {
  const db = readDb();
  const user = db.users.find((entry) => entry.clerk_id === clerkId);
  if (!user) {
    return false;
  }

  db.users = db.users.filter((entry) => entry.clerk_id !== clerkId);
  writeDb(db);
  return true;
}

export function getUserSnapshot(clerkId) {
  const db = readDb();
  const user = db.users.find((entry) => entry.clerk_id === clerkId);
  const articles = db.articles
    .filter((article) => article.user_id === user?.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return { user, articles };
}

export function purchaseCredits(clerkId, amount, creditsAdded) {
  const db = readDb();
  const user = db.users.find((entry) => entry.clerk_id === clerkId);

  if (!user) {
    throw new Error("User not found");
  }

  user.credit_balance += creditsAdded;
  db.transactions.push({
    id: uuidv4(),
    user_id: user.id,
    amount,
    credits_added: creditsAdded,
    timestamp: new Date().toISOString()
  });

  writeDb(db);
  return user;
}

export function getArticleById(articleId, clerkId) {
  const db = readDb();
  const user = db.users.find((entry) => entry.clerk_id === clerkId);
  return db.articles.find(
    (article) => article.id === articleId && article.user_id === user?.id
  );
}

function getProviderAttemptOrder(requestedProviders = []) {
  const enabledProviders = getEnabledProviderIds();
  const requested = requestedProviders.filter(
    (providerId) => Boolean(providerId) && enabledProviders.includes(providerId)
  );
  const ordered = [];

  for (const providerId of requested) {
    if (!ordered.includes(providerId)) {
      ordered.push(providerId);
    }
  }

  for (const providerId of defaultProviderOrder) {
    if (enabledProviders.includes(providerId) && !ordered.includes(providerId)) {
      ordered.push(providerId);
    }
  }

  for (const providerId of enabledProviders) {
    if (!ordered.includes(providerId)) {
      ordered.push(providerId);
    }
  }

  return ordered;
}

function getAgentRole(providerId) {
  const roles = {
    openai: "Lead Analyst",
    gemini_flash: "Skeptic Reviewer",
    gemini_flash_lite: "Speed Researcher"
  };

  return roles[providerId] || "Roundtable Agent";
}

function splitIntoMemoryBlocks(finalOutput) {
  const sections = finalOutput
    .split(/\n(?=#{1,3}\s)|\n{2,}(?=[A-Z][^\n]{2,80}:)/)
    .map((section) => section.trim())
    .filter(Boolean);
  const sourceSections = sections.length > 1 ? sections : finalOutput.split(/\n{2,}/).filter(Boolean);

  return sourceSections.map((content, index) => {
    const firstLine = content.split("\n")[0]?.replace(/^#{1,3}\s*/, "").replace(/:$/, "");
    return {
      id: `block-${index + 1}`,
      order: index + 1,
      title: firstLine && firstLine.length < 90 ? firstLine : `Section ${index + 1}`,
      content,
      revision_history: []
    };
  });
}

function buildContextTree({ topic, category, segment, controls, finalOutput }) {
  return {
    id: uuidv4(),
    topic,
    category,
    segment,
    controls,
    blocks: splitIntoMemoryBlocks(finalOutput),
    updated_at: new Date().toISOString()
  };
}

function renderContextTree(contextTree) {
  return contextTree.blocks
    .sort((a, b) => a.order - b.order)
    .map((block) => block.content)
    .join("\n\n");
}

function buildDebateTranscript({ draftResponses, debateRounds, judgeResult, providerFailures, passLabel }) {
  const transcript = [
    {
      type: "dispatch",
      actor: "Orchestrator",
      message: `Opened ${passLabel} with ${draftResponses.length} competing agents.`
    },
    ...draftResponses.map((draft) => ({
      type: "draft",
      actor: `${draft.providerLabel} (${getAgentRole(draft.providerId)})`,
      message: `Submitted an independent draft using ${draft.model}.`
    })),
    ...debateRounds.flatMap((round) =>
      round.critiques.map((critique) => ({
        type: "critique",
        actor: `${round.providerLabel} (${getAgentRole(round.providerId)})`,
        target: critique.target,
        message: critique.critique
      }))
    ),
    ...debateRounds.map((round) => ({
      type: "revision",
      actor: `${round.providerLabel} (${getAgentRole(round.providerId)})`,
      message: "Revised its answer after adversarial critique."
    })),
    {
      type: "judge",
      actor: `${judgeResult.judgeProvider} Judge`,
      message: `Synthesized the competing drafts with a ${judgeResult.consensusScore ?? "pending"}% consensus rating.`
    }
  ];

  return transcript.concat(
    providerFailures.map((failure) => ({
      type: "provider-failure",
      actor: failure.providerId,
      message: `${failure.stage} failed: ${failure.error}`
    }))
  );
}

function calculateConsensusScore({ debateRounds, providerFailures, judgeResult }) {
  if (typeof judgeResult.consensusScore === "number") {
    return Math.max(0, Math.min(100, judgeResult.consensusScore));
  }

  const critiqueCount = debateRounds.reduce(
    (total, round) => total + round.critiques.length,
    0
  );
  const completedRevisionCount = debateRounds.filter(
    (round) => Boolean(round.revisedDraft)
  ).length;
  const baseScore = 76;
  const critiqueBonus = Math.min(critiqueCount * 3, 18);
  const revisionBonus = completedRevisionCount * 3;
  const failurePenalty = providerFailures.length * 6;

  return Math.max(45, Math.min(96, baseScore + critiqueBonus + revisionBonus - failurePenalty));
}

function buildModelBadges(draftResponses, judgeResult) {
  return draftResponses.map((draft) => ({
    providerId: draft.providerId,
    label: draft.providerLabel,
    model: draft.model,
    role: getAgentRole(draft.providerId),
    contribution: draft.providerId === judgeResult.judgeProvider ? "Draft + Judge" : "Draft + Critique"
  }));
}

async function collectDraftResponses({
  topic,
  category,
  segment,
  providers,
  controls,
  reworkBrief,
  onEvent
}) {
  const attemptOrder = getProviderAttemptOrder(providers);
  const successfulDrafts = [];
  const providerFailures = [];
  let cursor = 0;

  while (successfulDrafts.length < 3 && cursor < attemptOrder.length) {
    const remainingNeeded = 3 - successfulDrafts.length;
    const batch = attemptOrder.slice(cursor, cursor + remainingNeeded);
    cursor += remainingNeeded;

    if (batch.length === 0) {
      break;
    }

    const results = await Promise.allSettled(
      batch.map(async (providerId) => {
        onEvent?.({
          type: "agent-thinking",
          stage: "draft",
          providerId,
          message: `${getAgentRole(providerId)} is drafting with ${providerId}.`
        });
        const draft = await generateProviderDraft({
          providerId,
          topic,
          category,
          segment,
          ...controls,
          reworkBrief
        });
        onEvent?.({
          type: "agent-complete",
          stage: "draft",
          providerId,
          message: `${draft.providerLabel} submitted its opening draft.`
        });
        return draft;
      })
    );

    results.forEach((result, index) => {
      const providerId = batch[index];

      if (result.status === "fulfilled") {
        successfulDrafts.push(result.value);
      } else {
        onEvent?.({
          type: "agent-failed",
          stage: "draft",
          providerId,
          message: `${providerId} failed during draft generation. Trying fallback if available.`
        });
        providerFailures.push({
          stage: "draft",
          providerId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    });
  }

  if (successfulDrafts.length < 3) {
    const error = new Error(
      "Unable to secure three successful provider drafts. Check API keys, quotas, or provider availability."
    );
    error.code = "PROVIDER_DRAFT_FAILURE";
    error.details = providerFailures;
    throw error;
  }

  return {
    draftResponses: successfulDrafts.slice(0, 3),
    providerFailures
  };
}

async function executeDebateCycle({
  topic,
  category,
  segment,
  providers,
  controls,
  reworkBrief = "",
  passLabel,
  onEvent
}) {
  const { draftResponses, providerFailures } = await collectDraftResponses({
    topic,
    category,
    segment,
    providers,
    controls,
    reworkBrief,
    onEvent
  });

  onEvent?.({
    type: "stage-complete",
    stage: "draft",
    providers: draftResponses.map((entry) => entry.providerId),
    message: "All opening drafts are ready. Starting adversarial critique."
  });

  const debateRounds = await Promise.all(
    draftResponses.map(async (draftResponse) => {
      const peers = draftResponses.filter(
        (entry) => entry.providerId !== draftResponse.providerId
      );
      let critiques = [];
      let revisedDraft = draftResponse.draft;

      try {
        onEvent?.({
          type: "agent-thinking",
          stage: "critique",
          providerId: draftResponse.providerId,
          message: `${draftResponse.providerLabel} is critiquing competing drafts.`
        });
        critiques = await critiqueDrafts({
          providerId: draftResponse.providerId,
          peers,
          topic,
          category,
          segment,
          ...controls
        });
        onEvent?.({
          type: "agent-complete",
          stage: "critique",
          providerId: draftResponse.providerId,
          message: `${draftResponse.providerLabel} completed adversarial critique.`
        });
      } catch (error) {
        providerFailures.push({
          stage: "critique",
          providerId: draftResponse.providerId,
          error: error instanceof Error ? error.message : String(error)
        });
        critiques = peers.map((peer) => ({
          from: draftResponse.providerId,
          target: peer.providerId,
          critique: `${draftResponse.providerLabel} critique unavailable due to provider failure; judge should scrutinize ${peer.providerLabel} directly.`
        }));
      }

      try {
        onEvent?.({
          type: "agent-thinking",
          stage: "revision",
          providerId: draftResponse.providerId,
          message: `${draftResponse.providerLabel} is revising after critique.`
        });
        revisedDraft = await reviseDraft({
          draftResponse,
          critiques,
          topic,
          category,
          segment,
          ...controls
        });
        onEvent?.({
          type: "agent-complete",
          stage: "revision",
          providerId: draftResponse.providerId,
          message: `${draftResponse.providerLabel} submitted its revised answer.`
        });
      } catch (error) {
        providerFailures.push({
          stage: "revision",
          providerId: draftResponse.providerId,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      return {
        providerId: draftResponse.providerId,
        providerLabel: draftResponse.providerLabel,
        model: draftResponse.model,
        draft: draftResponse.draft,
        revisedDraft,
        critiques
      };
    })
  );

  onEvent?.({
    type: "stage-complete",
    stage: "revision",
    message: "All available revisions are complete. Judge is synthesizing consensus."
  });

  onEvent?.({
    type: "agent-thinking",
    stage: "judge",
    providerId: "judge",
    message: "Judge is comparing drafts and producing the final consensus."
  });
  const judgeResult = await judgeConsensus({
    topic,
    category,
    segment,
    debateRounds,
    ...controls
  });
  const consensusScore = calculateConsensusScore({
    debateRounds,
    providerFailures,
    judgeResult
  });
  judgeResult.consensusScore = consensusScore;
  onEvent?.({
    type: "agent-complete",
    stage: "judge",
    providerId: judgeResult.judgeProvider,
    message: `${judgeResult.judgeProvider} judge scored ${consensusScore}% consensus.`
  });

  return {
    passLabel,
    draftResponses,
    providerFailures,
    debateRounds,
    judgeResult,
    consensusScore,
    modelBadges: buildModelBadges(draftResponses, judgeResult),
    debateTranscript: buildDebateTranscript({
      draftResponses,
      debateRounds,
      judgeResult,
      providerFailures,
      passLabel
    })
  };
}

function buildReworkBrief(attempt) {
  const notes = attempt.judgeResult.judgeNotes?.join(" ") || "The judge found unresolved disagreement.";
  return `Previous consensus score was ${attempt.consensusScore}%, below the required ${CONSENSUS_THRESHOLD}%. Reconcile contradictions, remove unsupported claims, improve specificity, and address judge notes: ${notes}`;
}

async function runGuardedConsensus(input) {
  const attempts = [];
  let reworkBrief = "";

  for (let attemptNumber = 1; attemptNumber <= MAX_CONSENSUS_ATTEMPTS; attemptNumber += 1) {
    const passLabel = attemptNumber === 1 ? "initial consensus pass" : `rework pass ${attemptNumber}`;
    input.onEvent?.({
      type: attemptNumber === 1 ? "dispatch" : "rework",
      stage: "consensus-guardrail",
      providers: input.providers,
      message:
        attemptNumber === 1
          ? `Dispatching to ${input.providers.join(", ")}.`
          : `Consensus below ${CONSENSUS_THRESHOLD}%. Running targeted rework pass.`
    });

    const attempt = await executeDebateCycle({
      ...input,
      reworkBrief,
      passLabel
    });
    attempts.push(attempt);

    if (attempt.consensusScore >= CONSENSUS_THRESHOLD) {
      return { acceptedAttempt: attempt, attempts };
    }

    input.onEvent?.({
      type: "rejected",
      stage: "consensus-guardrail",
      message: `Judge rejected ${attempt.consensusScore}% consensus. Minimum visible threshold is ${CONSENSUS_THRESHOLD}%.`
    });
    reworkBrief = buildReworkBrief(attempt);
  }

  const error = new Error(
    `Consensus rejected after ${MAX_CONSENSUS_ATTEMPTS} attempts. Minimum required score is ${CONSENSUS_THRESHOLD}%.`
  );
  error.code = "CONSENSUS_REJECTED";
  error.details = attempts.map((attempt) => ({
    passLabel: attempt.passLabel,
    consensusScore: attempt.consensusScore,
    judgeNotes: attempt.judgeResult.judgeNotes
  }));
  throw error;
}

export async function runRoundtableGeneration({
  clerkId,
  topic,
  category,
  segment,
  providers,
  intent,
  length,
  tonality,
  onEvent
}) {
  const db = readDb();
  const user = db.users.find((entry) => entry.clerk_id === clerkId);

  if (!user) {
    throw new Error("User not found");
  }

  const creditsUsed = 1;
  if (user.credit_balance <= 0) {
    const error = new Error("Insufficient credits");
    error.code = "INSUFFICIENT_CREDITS";
    throw error;
  }

  const selectedProviders = pickProviders(providers);
  if (selectedProviders.length < 3 && getEnabledProviderIds().length < 3) {
    throw new Error(
      "At least three distinct live providers with configured API keys are required."
    );
  }

  const controls = normalizeControls({ intent, length, tonality });
  const { acceptedAttempt, attempts } = await runGuardedConsensus({
    topic,
    category,
    segment,
    providers: selectedProviders,
    controls,
    onEvent
  });

  user.credit_balance -= creditsUsed;
  onEvent?.({
    type: "credit",
    stage: "billing",
    creditsUsed,
    balanceAfter: user.credit_balance,
    message: `${creditsUsed} credit deducted after successful consensus.`
  });

  const contextTree = buildContextTree({
    topic,
    category,
    segment,
    controls,
    finalOutput: acceptedAttempt.judgeResult.finalOutput
  });

  const article = {
    id: uuidv4(),
    user_id: user.id,
    topic,
    final_output: acceptedAttempt.judgeResult.finalOutput,
    context_tree: contextTree,
    generation_controls: controls,
    agent_logs: {
      selectedProviders: acceptedAttempt.draftResponses.map((entry) => entry.providerId),
      requestedProviders: selectedProviders,
      providerFailures: acceptedAttempt.providerFailures,
      modelBadges: acceptedAttempt.modelBadges,
      debateTranscript: acceptedAttempt.debateTranscript,
      consensusScore: acceptedAttempt.consensusScore,
      consensusThreshold: CONSENSUS_THRESHOLD,
      consensusAttempts: attempts.map((attempt) => ({
        passLabel: attempt.passLabel,
        consensusScore: attempt.consensusScore,
        accepted: attempt.consensusScore >= CONSENSUS_THRESHOLD
      })),
      creditSummary: {
        creditsUsed,
        balanceAfter: user.credit_balance,
        message: `${creditsUsed} credit deducted for this multi-agent consensus run.`
      },
      debateRounds: acceptedAttempt.debateRounds,
      judge: acceptedAttempt.judgeResult,
      refinementHistory: []
    },
    credits_used: creditsUsed,
    status: "completed",
    category,
    segment,
    created_at: new Date().toISOString()
  };

  db.articles.push(article);
  db.transactions.push({
    id: uuidv4(),
    user_id: user.id,
    amount: 0,
    credits_added: -creditsUsed,
    timestamp: new Date().toISOString()
  });
  writeDb(db);

  return { article, creditBalance: user.credit_balance };
}

export async function refineArticleBlock({
  clerkId,
  articleId,
  blockId,
  instruction,
  onEvent
}) {
  const db = readDb();
  const user = db.users.find((entry) => entry.clerk_id === clerkId);
  const article = db.articles.find(
    (entry) => entry.id === articleId && entry.user_id === user?.id
  );

  if (!user) {
    throw new Error("User not found");
  }

  if (!article) {
    const error = new Error("Article not found");
    error.code = "ARTICLE_NOT_FOUND";
    throw error;
  }

  if (user.credit_balance <= 0) {
    const error = new Error("Insufficient credits");
    error.code = "INSUFFICIENT_CREDITS";
    throw error;
  }

  if (!instruction?.trim()) {
    const error = new Error("Refinement instruction is required.");
    error.code = "INVALID_REFINEMENT";
    throw error;
  }

  if (!article.context_tree) {
    article.context_tree = buildContextTree({
      topic: article.topic,
      category: article.category,
      segment: article.segment,
      controls: article.generation_controls || normalizeControls(),
      finalOutput: article.final_output
    });
  }

  const block = article.context_tree.blocks.find((entry) => entry.id === blockId);
  if (!block) {
    const error = new Error("Editable block not found");
    error.code = "BLOCK_NOT_FOUND";
    throw error;
  }

  const selectedProviders = article.agent_logs?.selectedProviders?.length
    ? article.agent_logs.selectedProviders
    : pickProviders([]);
  const controls = normalizeControls(article.generation_controls || article.context_tree.controls);
  const refinementTopic = [
    `Original document topic: ${article.topic}`,
    `Target block: ${block.title}`,
    "Current block content:",
    block.content,
    "Judge instruction:",
    instruction,
    "Only regenerate this target block. Preserve compatibility with the surrounding document."
  ].join("\n\n");

  const { acceptedAttempt, attempts } = await runGuardedConsensus({
    topic: refinementTopic,
    category: article.category,
    segment: article.segment,
    providers: selectedProviders,
    controls,
    onEvent
  });

  block.revision_history.push({
    id: uuidv4(),
    instruction,
    previous_content: block.content,
    consensusScore: acceptedAttempt.consensusScore,
    created_at: new Date().toISOString()
  });
  block.content = acceptedAttempt.judgeResult.finalOutput;
  block.updated_at = new Date().toISOString();
  article.context_tree.updated_at = new Date().toISOString();
  article.final_output = renderContextTree(article.context_tree);

  user.credit_balance -= 1;
  article.credits_used += 1;
  article.agent_logs = {
    ...article.agent_logs,
    consensusScore: acceptedAttempt.consensusScore,
    debateTranscript: acceptedAttempt.debateTranscript,
    debateRounds: acceptedAttempt.debateRounds,
    modelBadges: acceptedAttempt.modelBadges,
    judge: acceptedAttempt.judgeResult,
    refinementHistory: [
      ...(article.agent_logs?.refinementHistory || []),
      {
        id: uuidv4(),
        blockId,
        instruction,
        consensusScore: acceptedAttempt.consensusScore,
        consensusAttempts: attempts.map((attempt) => ({
          passLabel: attempt.passLabel,
          consensusScore: attempt.consensusScore,
          accepted: attempt.consensusScore >= CONSENSUS_THRESHOLD
        })),
        created_at: new Date().toISOString()
      }
    ],
    creditSummary: {
      creditsUsed: 1,
      balanceAfter: user.credit_balance,
      message: "1 credit deducted for this targeted Judge refinement."
    }
  };

  db.transactions.push({
    id: uuidv4(),
    user_id: user.id,
    amount: 0,
    credits_added: -1,
    timestamp: new Date().toISOString()
  });
  writeDb(db);

  onEvent?.({
    type: "credit",
    stage: "billing",
    creditsUsed: 1,
    balanceAfter: user.credit_balance,
    message: "1 credit deducted after successful targeted refinement."
  });

  return { article, creditBalance: user.credit_balance };
}
