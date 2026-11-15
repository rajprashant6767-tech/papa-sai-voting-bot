
const express = require("express");
const { Telegraf } = require("telegraf");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error("Required environment variables are missing");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY
);

const bot = new Telegraf(BOT_TOKEN);

// Home page
app.get("/", (req, res) => {
  res.send("PAPA SAI Voting Bot is running");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Start command
bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id);

  const username = ctx.from.username || null;

  const fullName = [
    ctx.from.first_name,
    ctx.from.last_name
  ].filter(Boolean).join(" ");

  try {
    const { error } = await supabase
      .from("bot_users")
      .upsert(
        {
          telegram_id: telegramId,
          username,
          full_name: fullName
        },
        {
          onConflict: "telegram_id"
        }
      );

    if (error) {
      console.error("User save error:", error);

      return ctx.reply(
        "Abhi dikkat aa rahi hai. Thodi der baad try karein."
      );
    }

    return ctx.reply(
      `Welcome ${fullName || "User"}!

PAPA SAI Voting Bot mein aapka swagat hai.`
    );

  } catch (error) {
    console.error("Start command error:", error);

    return ctx.reply(
      "Kuch technical problem aa gayi hai. Baad mein try karein."
    );
  }
});

// Telegram webhook
app.post("/telegram", async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error("Telegram update error:", error);
    res.sendStatus(500);
  }
});

// Start server and configure webhook
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  if (APP_URL) {
    try {
      await bot.telegram.setWebhook(
        `${APP_URL.replace(/\/$/, "")}/telegram`
      );

      console.log("Telegram webhook configured");

    } catch (error) {
      console.error("Webhook setup error:", error);
    }
  } else {
    console.log("APP_URL is not configured yet");
  }
});
