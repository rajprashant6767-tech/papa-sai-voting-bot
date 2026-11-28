
const express = require("express");
const { Telegraf, Markup } = require("telegraf");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = (process.env.WEBHOOK_URL || "").replace(/\/+$/, "");
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const OWNER_ID = "7927224931";

if (!BOT_TOKEN || !WEBHOOK_URL || !WEBHOOK_SECRET ||
    !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error("Required environment variables missing");
}

const bot = new Telegraf(BOT_TOKEN);

async function supabaseRpc(functionName, params = {}) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params)
    }
  );

  const result = await response.text();

  if (!response.ok) {
    console.error("Supabase RPC error:", functionName, response.status, result);
    throw new Error(`DATABASE_ERROR_${response.status}`);
  }

  return result ? JSON.parse(result) : null;
}

function mainMenu(ctx) {
  const id = String(ctx.from.id);

  if (id === OWNER_ID) {
    return ctx.reply(
      "👑 DEMONS VOTING BOT\n\nOwner Panel",
      Markup.keyboard([
        ["Add Channel", "Manage Channels"],
        ["Announcement", "All Users"],
        ["Manage Channel Admins", "Global User Management"],
        ["Payment Management", "Global Promo Management"],
        ["Global Reports", "Channel Settings"],
        ["Manage Scanners", "Bot Activity Logs"],
        ["Broadcast History", "Bot Status"],
        ["Bot Settings"]
      ]).resize()
    );
  }

  return ctx.reply(
    "👋 DEMONS VOTING BOT mein aapka swagat hai.",
    Markup.keyboard([
      ["Add Money", "Register Now"],
      ["Add Votes", "Check Balance"],
      ["All Participants", "Payment History"],
      ["Wallet History", "Leaderboard"],
      ["Redeem Promo", "My Profile"]
    ]).resize()
  );
}

bot.start(async (ctx) => {
  try {
    await mainMenu(ctx);
  } catch (error) {
    console.error("/start error:", error);
    await ctx.reply("Kuch dikkat aa gayi. Kripya dobara try karein.");
  }
});

bot.command("menu", async (ctx) => {
  await mainMenu(ctx);
});

bot.catch((error, ctx) => {
  console.error("Telegram update error:", error);
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "DEMONS VOTING BOT",
    mode: "webhook"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    telegram: "configured",
    database: "configured"
  });
});

app.use(
  bot.webhookCallback("/telegram/webhook", {
    secretToken: WEBHOOK_SECRET
  })
);

const server = app.listen(PORT, async () => {
  console.log(`DEMONS VOTING BOT listening on ${PORT}`);

  try {
    const me = await bot.telegram.getMe();

    await bot.telegram.setWebhook(
      `${WEBHOOK_URL}/telegram/webhook`,
      {
        secret_token: WEBHOOK_SECRET,
        allowed_updates: [
          "message",
          "callback_query",
          "chat_member",
          "my_chat_member"
        ]
      }
    );

    console.log(`Webhook active for @${me.username}`);
  } catch (error) {
    console.error("Webhook setup failed:", error.message);
    server.close(() => process.exit(1));
  }
});

process.on("SIGTERM", async () => {
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
  } catch (error) {
    console.error("Webhook shutdown error:", error.message);
  }
  server.close();
});
      
