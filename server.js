
const express = require("express");
const { Telegraf, Markup } = require("telegraf");
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

// Telegram Channels
const CHANNELS = [
  {
    name: "DEMONS GIVEAWAY 2026-27",
    username: "@DEMONS_GIVEAWAY_2026_27",
    link: "https://t.me/DEMONS_GIVEAWAY_2026_27"
  },
  {
    name: "ZyloBet",
    username: "@ZyloBet",
    link: "https://t.me/ZyloBet"
  }
];

// Check both channel memberships
async function checkMembership(telegramId) {
  for (const channel of CHANNELS) {
    const member = await bot.telegram.getChatMember(
      channel.username,
      telegramId
    );

    const joined =
      ["creator", "administrator", "member"].includes(member.status) ||
      (member.status === "restricted" && member.is_member === true);

    if (!joined) {
      return false;
    }
  }

  return true;
}

// Save verified user in Supabase
async function saveUser(ctx) {
  const telegramId = String(ctx.from.id);

  const fullName = [
    ctx.from.first_name,
    ctx.from.last_name
  ].filter(Boolean).join(" ");

  const { error } = await supabase
    .from("bot_users")
    .upsert(
      {
        telegram_id: telegramId,
        username: ctx.from.username || null,
        full_name: fullName
      },
      {
        onConflict: "telegram_id"
      }
    );

  if (error) {
    console.error("User save error:", error);
    throw error;
  }

  return fullName || "User";
}

// Welcome message
async function showWelcome(ctx) {
  const fullName = await saveUser(ctx);

  const message =
    `Welcome ${fullName}!\n\n` +
    "DEMONS VOTING BOT mein aapka swagat hai.";

  if (ctx.callbackQuery) {
    await ctx.editMessageText(message);
  } else {
    await ctx.reply(message);
  }
}

// Channel buttons - only channel names
function joinKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.url(
        "DEMONS GIVEAWAY 2026-27",
        CHANNELS[0].link
      )
    ],
    [
      Markup.button.url(
        "ZyloBet",
        CHANNELS[1].link
      )
    ],
    [
      Markup.button.callback(
        "Verify Membership",
        "verify_membership"
      )
    ]
  ]);
}

// Show channel screen
async function showJoinScreen(ctx) {
  const message =
    "Welcome to DEMONS VOTING BOT!\n\n" +
    "Bot use karne ke liye dono Telegram channels join karein.\n\n" +
    "Dono channels join karne ke baad Verify button dabayein.";

  return ctx.reply(message, joinKeyboard());
}

// Start command
bot.start(async (ctx) => {
  try {
    const joined = await checkMembership(ctx.from.id);

    if (joined) {
      return await showWelcome(ctx);
    }

    return await showJoinScreen(ctx);

  } catch (error) {
    console.error("Start error:", error);

    return ctx.reply(
      "Membership check nahi ho paya. Thodi der baad /start karein."
    );
  }
});

// Verify membership button
bot.action("verify_membership", async (ctx) => {
  try {
    const joined = await checkMembership(ctx.from.id);

    if (!joined) {
      return ctx.answerCbQuery(
        "Pehle dono channels join karein!",
        { show_alert: true }
      );
    }

    await ctx.answerCbQuery("Verification successful!");
    await showWelcome(ctx);

  } catch (error) {
    console.error("Verification error:", error);

    try {
      await ctx.answerCbQuery(
        "Verification mein problem hai. Dobara try karein.",
        { show_alert: true }
      );
    } catch (_) {}
  }
});

// Home page
app.get("/", (req, res) => {
  res.send("DEMONS VOTING BOT is running");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true });
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

// Start server
app.listen(PORT, async () => {
  console.log(`DEMONS VOTING BOT running on port ${PORT}`);

  if (APP_URL) {
    try {
      await bot.telegram.setWebhook(
        `${APP_URL.replace(/\/$/, "")}/telegram`
      );

      console.log("Telegram webhook configured");
    } catch (error) {
      console.error("Webhook setup error:", error);
    }
  }
});
