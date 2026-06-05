function getProviderCatalog() {
  return {
    openai: {
      label: "OpenAI GPT-4o",
      model: process.env.OPENAI_MODEL || "gpt-4o"
    },
    gemini_flash: {
      label: "Gemini 2.5 Flash",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
    },
    gemini_flash_lite: {
      label: "Gemini 2.5 Flash-Lite",
      model: process.env.GEMINI_FLASH_LITE_MODEL || "gemini-2.5-flash-lite"
    }
  };
}

function getProviderKey(providerId) {
  return {
    openai: process.env.OPENAI_API_KEY,
    gemini_flash: process.env.GEMINI_API_KEY,
    gemini_flash_lite: process.env.GEMINI_API_KEY
  }[providerId];
}

const providerRoles = {
  openai: "methodical, evidence-first, and strong at final reasoning",
  gemini_flash: "fast-moving, pragmatic, and well-balanced under pressure",
  gemini_flash_lite: "ultra-fast, concise, and stability-oriented"
};

const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 90000);
const OVERLOAD_RETRY_DELAYS_MS = [2000, 4000, 8000];

function getMaxOutputTokens(stage, length = "Medium") {
  const byLength = {
    Short: { draft: 700, revision: 800, judge: 1000 },
    Medium: { draft: 1100, revision: 1200, judge: 1500 },
    Large: { draft: 1500, revision: 1700, judge: 2200 },
    "Extra Long": { draft: 2100, revision: 2400, judge: 3000 }
  };
  const stageCaps = byLength[length] || byLength.Medium;
  return stageCaps[stage] || 700;
}

function formatLinkList(label, links = []) {
  const cleaned = Array.isArray(links)
    ? links.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 6)
    : [];

  if (cleaned.length === 0) {
    return `${label}: none provided. Recommend natural placeholder opportunities only when useful.`;
  }

  return `${label}: ${cleaned.join(" | ")}`;
}

function buildLinkingGuidance(linking = {}) {
  return [
    formatLinkList("Internal links", linking.internalLinks),
    formatLinkList("External links", linking.externalLinks),
    formatLinkList("3rd party reference links", linking.referenceLinks)
  ].join("\n");
}

function getSegmentGuidance(segment) {
  const guidance = {
    Nursery: "Use very simple words, tiny steps, and gentle examples suitable for early learners.",
    Primary: "Use simple explanations, short sentences, and concrete examples suitable for children.",
    Secondary: "Use clear school-level explanations with structured steps and moderate vocabulary.",
    Undergraduate: "Use academic but accessible language with explicit reasoning and examples.",
    Postgraduate: "Use advanced academic language, domain precision, and stronger methodological framing.",
    PhD: "Use expert-level precision, rigorous argumentation, and research-grade terminology."
  };

  return guidance[segment] || guidance.Undergraduate;
}

function getControlGuidance({ intent = "Research", length = "Medium", tonality = "Academic" }) {
  const intentGuidance = {
    Research: "Intent: research support. Emphasize evidence, nuance, careful claims, and citation-ready framing.",
    Legal: "Intent: legal background. Explain concepts carefully, avoid pretending to provide legal advice, and flag jurisdiction-sensitive assumptions.",
    Technical: "Intent: technical background. Prioritize implementation detail, mechanisms, tradeoffs, and precise terminology."
  };
  const lengthGuidance = {
    Short: "Length: short. Be concise and high-signal.",
    Medium: "Length: medium. Balance coverage with readability.",
    Large: "Length: large. Provide expanded analysis with clear structure.",
    "Extra Long": "Length: extra long. Provide deep, sectioned coverage with substantial detail."
  };
  const toneGuidance = {
    Technical: "Tonality: technical language with exact terms and direct explanations.",
    Explanatory: "Tonality: explanatory language with plain reasoning and helpful examples.",
    Academic: "Tonality: academic language with formal structure and disciplined claims."
  };

  return [
    intentGuidance[intent] || intentGuidance.Research,
    lengthGuidance[length] || lengthGuidance.Medium,
    toneGuidance[tonality] || toneGuidance.Academic
  ].join(" ");
}

function buildModulePrompt({
  category,
  topic,
  segment,
  providerId,
  intent,
  length,
  tonality,
  linking,
  reworkBrief = ""
}) {
  const roleStyle = providerRoles[providerId] || "balanced";
  const segmentGuidance = getSegmentGuidance(segment);
  const controlGuidance = getControlGuidance({ intent, length, tonality });
  const linkingGuidance = buildLinkingGuidance(linking);
  const reworkGuidance = reworkBrief
    ? `This is a rework pass because the previous consensus was rejected. Fix these weaknesses: ${reworkBrief}`
    : "";

  if (category === "Research") {
    return {
      system: [
        "You are part of an adversarial consensus engine for academic and professional research writing.",
        `Your debating role is ${roleStyle}.`,
        "Produce a precise research-grade draft that can survive criticism from competing models.",
        "Prioritize formal structure, technical accuracy, explicit assumptions, and citation-ready claims.",
        "Where sources cannot be verified directly, mark claims as needing verification rather than inventing evidence.",
        `Audience level: ${segment}. ${segmentGuidance}`,
        controlGuidance,
        reworkGuidance
      ].join(" "),
      user: [
        `Research task: ${topic}`,
        "Deliver a rigorous draft with the following sections: Thesis, Core Analysis, Evidence or Data Points, Counterarguments, and Preliminary References.",
        "Keep the answer focused on accuracy, adversarial defensibility, and high-signal content."
      ].join("\n")
    };
  }

  if (category === "Blog") {
    return {
      system: [
        "You are part of an adversarial consensus engine for professional blog writing.",
        `Your debating role is ${roleStyle}.`,
        "Produce a polished, engaging blog draft that can survive criticism from competing models.",
        "Prioritize fast, clean, paragraph-led writing over exhaustive coverage.",
        "The final blog must feel human-written, professional, plagiarism-free, and modern SEO optimized.",
        "Use the focus keyword naturally only 4-5 times throughout the blog; avoid keyword stuffing, spammy optimization, generic filler, exaggerated claims, and unsupported statistics.",
        "Use clean markdown with one H1 heading and useful H2 headings. Keep paragraphs balanced and readable, with limited bullets only when they genuinely help.",
        `Audience level: ${segment}. ${segmentGuidance}`,
        controlGuidance,
        reworkGuidance
      ].join(" "),
      user: [
        `Blog task: ${topic}`,
        "Deliver the blog in this exact order:",
        "SEO Meta Title",
        "SEO Meta Description",
        "SEO-Friendly Slug",
        "Tags: [tag1, tag2, tag3]",
        "Internal Links",
        "External Links",
        "3rd Party Reference Links",
        "# H1 Heading",
        "## H2 sections with paragraph-based content",
        "Conclusion",
        "Linking inputs:",
        linkingGuidance,
        "Use supplied links naturally in the linking sections and mention where they fit in the article. If no links are supplied, recommend sensible placeholder link targets without inventing fake URLs.",
        "Keep the writing informative, engaging, well organized, and easy to read."
      ].join("\n")
    };
  }

  return {
    system: [
      "You are part of an adversarial consensus engine for academic support.",
      `Your debating role is ${roleStyle}.`,
      "Produce a step-by-step educational answer that teaches clearly, not just concludes.",
      "Prioritize pedagogy, correctness, age-appropriate wording, and incremental explanation.",
      `Audience level: ${segment}. ${segmentGuidance}`,
      controlGuidance,
      reworkGuidance
    ].join(" "),
    user: [
      `Homework task: ${topic}`,
      "Deliver a helpful explanation with: direct answer, step-by-step reasoning, key concepts, and a short recap.",
      "Make the response understandable for the stated learner segment."
    ].join("\n")
  };
}

function buildCritiquePrompt({ providerId, topic, category, segment, peerDrafts, intent, length, tonality, linking }) {
  return {
    system: [
      "You are a critical reviewer in an adversarial consensus engine.",
      `Your reviewing style is ${providerRoles[providerId] || "balanced"}.`,
      "Your job is to find weak reasoning, generic wording, missing evidence, and audience mismatch."
    ].join(" "),
    user: [
      `Task topic: ${topic}`,
      `Category: ${category}`,
      `Audience: ${segment}`,
      getControlGuidance({ intent, length, tonality }),
      category === "Blog" ? `Blog linking requirements:\n${buildLinkingGuidance(linking)}` : "",
      "Review the following competing drafts and return concise critiques for each one.",
      peerDrafts
        .map((draft, index) => `Draft ${index + 1} from ${draft.providerLabel}:\n${draft.draft}`)
        .join("\n\n"),
      "For each draft, state: strongest point, main flaw, and one revision demand."
    ].join("\n\n")
  };
}

function buildRevisionPrompt({ draftResponse, critiques, topic, category, segment, intent, length, tonality, linking }) {
  return {
    system: [
      "You are revising your own answer after receiving adversarial critiques.",
      "Preserve your strongest insights but repair weak reasoning, generic wording, and audience mismatch."
    ].join(" "),
    user: [
      `Task topic: ${topic}`,
      `Category: ${category}`,
      `Audience: ${segment}`,
      getControlGuidance({ intent, length, tonality }),
      category === "Blog" ? `Preserve the required SEO sections, H1/H2 structure, natural keyword density, and linking sections.\n${buildLinkingGuidance(linking)}` : "",
      "Original draft:",
      draftResponse.draft,
      "Critiques to address:",
      critiques.map((entry) => `- ${entry.critique}`).join("\n"),
      "Return one improved draft only."
    ].join("\n\n")
  };
}

function buildJudgePrompt({ topic, category, segment, debateRounds, intent, length, tonality, linking }) {
  return {
    system: [
      "You are the judge in an adversarial consensus engine.",
      "Synthesize competing drafts into one finalized agreed-upon result.",
      "Eliminate groupthink, discard weak or repetitive claims, and preserve only the strongest justified content.",
      "For research tasks, prefer formal precision and citation-ready structure.",
      "For homework tasks, prefer clarity, pedagogy, and correct sequencing.",
      "For blog tasks, prefer engaging structure, strong hooks, useful takeaways, clean reader flow, modern SEO discipline, and the required metadata plus linking sections.",
      "You must give a strict consensus score from 0 to 100 based on agreement, factual stability, and remaining uncertainty."
    ].join(" "),
    user: [
      `Topic: ${topic}`,
      `Category: ${category}`,
      `Audience: ${segment}`,
      getControlGuidance({ intent, length, tonality }),
      category === "Blog" ? `Required blog linking inputs:\n${buildLinkingGuidance(linking)}` : "",
      "Competing drafts and their revisions:",
      debateRounds
        .map(
          (round, index) =>
            `Provider ${index + 1} (${round.providerLabel})\nOriginal:\n${round.draft}\n\nRevised:\n${round.revisedDraft}\n\nCritiques:\n${round.critiques.map((entry) => `- ${entry.critique}`).join("\n")}`
        )
        .join("\n\n"),
      "Return exactly this structure:",
      "FINAL ANSWER:",
      "[single finalized answer]",
      "JUDGE RATIONALE:",
      "- [reason 1]",
      "- [reason 2]",
      "- [reason 3]",
      "CONSENSUS_SCORE: [0-100]"
    ].join("\n\n")
  };
}

async function fetchWithTimeout(url, options, timeoutMs = PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAI({ model, system, user, temperature = 0.4, maxOutputTokens }) {
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      temperature,
      ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${text}`);
  }
  const payload = JSON.parse(text);
  return payload.choices?.[0]?.message?.content?.trim() || "";
}

async function callGemini({ model, system, user, temperature = 0.4, maxOutputTokens }) {
  for (let attempt = 0; attempt <= OVERLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          generationConfig: {
            temperature,
            ...(maxOutputTokens ? { maxOutputTokens } : {})
          },
          contents: [{ role: "user", parts: [{ text: user }] }]
        })
      }
    );
    const text = await response.text();
    if (response.ok) {
      const payload = JSON.parse(text);
      return payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim() || "";
    }
    if (response.status === 503 && attempt < OVERLOAD_RETRY_DELAYS_MS.length) {
      await sleep(OVERLOAD_RETRY_DELAYS_MS[attempt]);
      continue;
    }
    throw new Error(`Provider request failed (${response.status}): ${text}`);
  }
  throw new Error("Gemini request failed after retries.");
}

async function callProvider({ providerId, system, user, temperature, maxOutputTokens }) {
  const providerCatalog = getProviderCatalog();
  const model = providerCatalog[providerId]?.model;
  if (!model) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (!getProviderKey(providerId)) {
    throw new Error(`Missing API key for provider: ${providerId}`);
  }
  if (providerId === "openai") {
    return callOpenAI({ model, system, user, temperature, maxOutputTokens });
  }
  return callGemini({ model, system, user, temperature, maxOutputTokens });
}

function splitCritiques(rawText, peers) {
  const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  return peers.map((peerDraft, index) => ({
    target: peerDraft.providerId,
    critique: lines[index] || `${peerDraft.providerLabel}: strengthen evidence, precision, and audience fit.`
  }));
}

function splitJudgeOutput(outputText) {
  const scoreMatch = outputText.match(/CONSENSUS_SCORE:\s*(\d{1,3})/i);
  const consensusScore = scoreMatch
    ? Math.max(0, Math.min(100, Number(scoreMatch[1])))
    : undefined;
  const withoutScore = outputText.replace(/CONSENSUS_SCORE:\s*\d{1,3}/i, "").trim();
  const finalMarker = "FINAL ANSWER:";
  const rationaleMarker = "JUDGE RATIONALE:";
  const finalMarkerIndex = withoutScore.toUpperCase().indexOf(finalMarker);
  const rationaleMarkerIndex = withoutScore.toUpperCase().indexOf(rationaleMarker);

  if (finalMarkerIndex === -1 || rationaleMarkerIndex === -1) {
    const fallbackMarker = "Judge rationale:";
    const fallbackIndex = withoutScore.indexOf(fallbackMarker);
    if (fallbackIndex === -1) {
      return { finalOutput: withoutScore.trim(), judgeNotes: [], consensusScore };
    }
    const finalOutput = withoutScore.slice(0, fallbackIndex).trim();
    const judgeNotes = withoutScore
      .slice(fallbackIndex + fallbackMarker.length)
      .split("\n")
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean);
    return { finalOutput, judgeNotes, consensusScore };
  }

  const finalOutput = withoutScore
    .slice(finalMarkerIndex + finalMarker.length, rationaleMarkerIndex)
    .trim();
  const judgeNotes = withoutScore
    .slice(rationaleMarkerIndex + rationaleMarker.length)
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean);
  return { finalOutput, judgeNotes, consensusScore };
}

export function getAvailableProviders() {
  const providerCatalog = getProviderCatalog();
  return Object.entries(providerCatalog).map(([id, config]) => ({
    id,
    enabled: Boolean(getProviderKey(id)),
    ...config
  }));
}

export function getEnabledProviderIds() {
  return getAvailableProviders().filter((provider) => provider.enabled).map((provider) => provider.id);
}

export async function generateProviderDraft({
  providerId,
  topic,
  category,
  segment,
  intent,
  length,
  tonality,
  linking,
  reworkBrief
}) {
  const prompt = buildModulePrompt({
    providerId,
    topic,
    category,
    segment,
    intent,
    length,
    tonality,
    linking,
    reworkBrief
  });
  const draft = await callProvider({
    providerId,
    system: prompt.system,
    user: prompt.user,
    temperature: 0.45,
    maxOutputTokens: getMaxOutputTokens("draft", length)
  });
  return {
    providerId,
    providerLabel: getProviderCatalog()[providerId]?.label || providerId,
    model: getProviderCatalog()[providerId]?.model || "unknown-model",
    status: "completed",
    segment,
    draft
  };
}

export async function critiqueDrafts({ providerId, peers, topic, category, segment, intent, length, tonality, linking }) {
  const prompt = buildCritiquePrompt({
    providerId,
    topic,
    category,
    segment,
    peerDrafts: peers,
    intent,
    length,
    tonality,
    linking
  });
  const critiqueText = await callProvider({
    providerId,
    system: prompt.system,
    user: prompt.user,
    temperature: 0.2,
    maxOutputTokens: 500
  });
  return splitCritiques(critiqueText, peers).map((entry) => ({
    from: providerId,
    target: entry.target,
    critique: entry.critique
  }));
}

export async function reviseDraft({ draftResponse, critiques, topic, category, segment, intent, length, tonality, linking }) {
  const prompt = buildRevisionPrompt({
    draftResponse,
    critiques,
    topic,
    category,
    segment,
    intent,
    length,
    tonality,
    linking
  });
  return callProvider({
    providerId: draftResponse.providerId,
    system: prompt.system,
    user: prompt.user,
    temperature: 0.35,
    maxOutputTokens: getMaxOutputTokens("revision", length)
  });
}

export async function judgeConsensus(input) {
  const judgeProviderId = process.env.OPENAI_API_KEY ? "openai" : "gemini_flash";
  const prompt = buildJudgePrompt(input);
  const outputText = await callProvider({
    providerId: judgeProviderId,
    system: prompt.system,
    user: prompt.user,
    temperature: 0.55,
    maxOutputTokens: getMaxOutputTokens("judge", input.length)
  });
  const parsed = splitJudgeOutput(outputText);
  return {
    judgeProvider: judgeProviderId,
    judgeModel: getProviderCatalog()[judgeProviderId].model,
    finalOutput: parsed.finalOutput,
    judgeNotes: parsed.judgeNotes,
    consensusScore: parsed.consensusScore
  };
}
