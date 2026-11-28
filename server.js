
const express = require("express");
const crypto = require("crypto");
const { Telegraf, Markup } = require("telegraf");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = (process.env.APP_URL || "").replace(/\/+$/, "");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const OWNER_ID = "7927224931";
const BOT_USERNAME = "PAPA_SAI_PANGA_BOT";
const BOT_NAME = "ZYNTRA BOT";

if (!BOT_TOKEN || !APP_URL || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error("Required environment variables missing");
}

const WEBHOOK_SECRET = crypto
  .createHash("sha256")
  .update(BOT_TOKEN)
  .digest("hex");

const bot = new Telegraf(BOT_TOKEN);

// ===============================
// SUPABASE CONNECTION
// ===============================

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
    console.error(
      "Supabase RPC Error:",
      functionName,
      response.status,
      result
    );

    throw new Error("DATABASE_ERROR");
  }

  return result ? JSON.parse(result) : null;
}

// ===============================
// KEYBOARDS
// ===============================

function ownerKeyboard() {
  return Markup.keyboard([
    ["Add Channel", "Manage Channels"],
    ["Announcement", "All Users"],
    ["Manage Channel Admins", "Global User Management"],
    ["Payment Management", "Global Promo Management"],
    ["Global Reports", "Channel Settings"],
    ["Manage Scanners", "Bot Activity Logs"],
    ["Broadcast History", "Bot Status"],
    ["Bot Settings"]
  ]).resize();
}

function userKeyboard() {
  return Markup.keyboard([
    ["Add Money", "Register Now"],
    ["Add Votes", "Check Balance"],
    ["All Participants", "Payment History"],
    ["Wallet History", "Leaderboard"],
    ["Redeem Promo", "My Profile"]
  ]).resize();
}

// ===============================
// START COMMAND
// ===============================

bot.start(async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);

    if (telegramId === OWNER_ID) {
      return ctx.reply(
        `👑 Welcome to ${BOT_NAME}!\n\nOwner Panel`,
        ownerKeyboard()
      );
    }

    return ctx.reply(
      `👋 ZYNTRA BOT mein aapka swagat hai!\n\nApna menu select karein.`,
      userKeyboard()
    );

  } catch (error) {
    console.error("Start error:", error);

    await ctx.reply(
      "Kuch dikkat aa gayi. Kripya dobara try karein."
    );
  }
});

// ===============================
// MENU COMMAND
// ===============================

bot.command("menu", async (ctx) => {
  if (String(ctx.from.id) === OWNER_ID) {
    return ctx.reply("👑 Owner Panel", ownerKeyboard());
  }

  return ctx.reply("ZYNTRA BOT Menu", userKeyboard());
});

// ===============================
// BOT INFORMATION
// ===============================

bot.command("about", async (ctx) => {
  await ctx.reply(
    `🤖 ${BOT_NAME}\n\n` +
    `Username: @${BOT_USERNAME}\n` +
    `Multi-Channel Voting Platform`
  );
});

// ===============================
// BASIC ERROR HANDLING
// ===============================

bot.catch((error, ctx) => {
  console.error("Telegram update error:", error);
});

// ===============================
// EXPRESS ROUTES
// ===============================

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: BOT_NAME,
    username: BOT_USERNAME,
    service: "Multi-Channel Voting Bot",
    mode: "Webhook"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    bot: BOT_NAME,
    webhook: "configured",
    database: "configured"
  });
});

// ===============================
// TELEGRAM WEBHOOK
// ===============================

app.use(
  bot.webhookCallback("/telegram/webhook", {
    secretToken: WEBHOOK_SECRET
  })
);

// ===============================
// START SERVER AND WEBHOOK
// ===============================

const server = app.listen(PORT, async () => {
  console.log(`${BOT_NAME} server running on port ${PORT}`);

  try {
    const me = await bot.telegram.getMe();

    if (me.username !== BOT_USERNAME) {
      throw new Error(
        `Bot username mismatch: expected @${BOT_USERNAME}, received @${me.username}`
      );
    }

    await bot.telegram.setWebhook(
      `${APP_URL}/telegram/webhook`,
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

    console.log(`Webhook active: @${me.username}`);
    console.log(`${BOT_NAME} is ready`);

  } catch (error) {
    console.error("Webhook setup failed:", error.message);
    server.close(() => process.exit(1));
  }
});

// ===============================
// GRACEFUL SHUTDOWN
// ===============================

process.on("SIGTERM", () => {
  server.close(() => {
    console.log(`${BOT_NAME} server stopped`);
  });
});
