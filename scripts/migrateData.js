import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "../data/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbJsonPath = path.join(__dirname, "..", "data", "db.json");

async function run() {
  if (!fs.existsSync(dbJsonPath)) {
    console.log("No db.json file found. Skipping data migration.");
    return;
  }

  const raw = fs.readFileSync(dbJsonPath, "utf8");
  const data = JSON.parse(raw);

  console.log("Migrating users...");
  const users = data.users || [];
  for (const user of users) {
    await prisma.user.upsert({
      where: { clerk_id: user.clerk_id },
      update: {
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        credit_balance: user.credit_balance
      },
      create: {
        id: user.id,
        clerk_id: user.clerk_id,
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        credit_balance: user.credit_balance
      }
    });
  }
  console.log(`Migrated ${users.length} users.`);

  console.log("Migrating articles...");
  const articles = data.articles || [];
  for (const article of articles) {
    const userExists = await prisma.user.findFirst({
      where: { id: article.user_id }
    });
    if (!userExists) {
      console.log(`Skipping article ${article.id} because user ${article.user_id} does not exist.`);
      continue;
    }

    const existingArticle = await prisma.article.findUnique({
      where: { id: article.id }
    });
    if (existingArticle) continue;

    await prisma.article.create({
      data: {
        id: article.id,
        user_id: article.user_id,
        topic: article.topic,
        final_output: article.final_output,
        context_tree: article.context_tree || {},
        generation_controls: article.generation_controls || {},
        agent_logs: article.agent_logs || {},
        credits_used: article.credits_used || 1,
        status: article.status || "completed",
        category: article.category,
        segment: article.segment,
        created_at: article.created_at ? new Date(article.created_at) : new Date()
      }
    });
  }
  console.log(`Migrated articles.`);

  console.log("Migrating transactions...");
  const transactions = data.transactions || [];
  for (const tx of transactions) {
    const userExists = await prisma.user.findFirst({
      where: { id: tx.user_id }
    });
    if (!userExists) {
      console.log(`Skipping transaction ${tx.id} because user ${tx.user_id} does not exist.`);
      continue;
    }

    const existingTx = await prisma.transaction.findUnique({
      where: { id: tx.id }
    });
    if (existingTx) continue;

    await prisma.transaction.create({
      data: {
        id: tx.id,
        user_id: tx.user_id,
        amount: Number(tx.amount || 0),
        credits_added: tx.credits_added || 0,
        timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date()
      }
    });
  }
  console.log(`Migrated transactions.`);
  console.log("Migration complete!");
}

run()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
