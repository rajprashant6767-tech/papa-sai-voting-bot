
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
const sessions = new Map();

let botInfo = null;

// =====================================
// SUPABASE RPC
// =====================================

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
    console.error("Supabase RPC:", functionName, response.status, result);
    throw new Error("DATABASE_ERROR");
  }

  return result ? JSON.parse(result) : null;
}

// =====================================
// BUTTON LABELS
// =====================================

const BUTTONS = {
  owner: {
    addChannel: "➕ Add Channel",
    manageChannels: "📢 Manage Channels",
    announcement: "📣 Announcement",
    allUsers: "👥 All Users",
    channelAdmins: "🛡️ Manage Channel Admins",
    globalUsers: "👤 Global User Management",
    payments: "💳 Payment Management",
    promos: "🎁 Global Promo Management",
    reports: "📊 Global Reports",
    channelSettings: "⚙️ Channel Settings",
    scanners: "🔍 Manage Scanners",
    logs: "📋 Bot Activity Logs",
    history: "📜 Broadcast History",
    status: "🤖 Bot Status",
    settings: "🛠️ Bot Settings"
  },

  user: {
    addMoney: "💵 Add Money",
    register: "📝 Register Now",
    addVotes: "🗳️ Add Votes",
    balance: "💰 Check Balance",
    participants: "👥 All Participants",
    paymentHistory: "🧾 Payment History",
    walletHistory: "📜 Wallet History",
    leaderboard: "🏆 Leaderboard",
    promo: "🎁 Redeem Promo",
    profile: "👤 My Profile"
  }
};

// =====================================
// MENUS
// =====================================

function ownerKeyboard() {
  const b = BUTTONS.owner;

  return Markup.keyboard([
    [b.addChannel, b.manageChannels],
    [b.announcement, b.allUsers],
    [b.channelAdmins, b.globalUsers],
    [b.payments, b.promos],
    [b.reports, b.channelSettings],
    [b.scanners, b.logs],
    [b.history, b.status],
    [b.settings]
  ]).resize();
}

function userKeyboard() {
  const b = BUTTONS.user;

  return Markup.keyboard([
    [b.addMoney, b.register],
    [b.addVotes, b.balance],
    [b.participants, b.paymentHistory],
    [b.walletHistory, b.leaderboard],
    [b.promo, b.profile]
  ]).resize();
}

function isOwner(ctx) {
  return String(ctx.from?.id) === OWNER_ID;
}

// Remove leading emoji/symbols before matching button text.
function normalizeButtonText(value) {
  return String(value || "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

async function showMainMenu(ctx) {
  sessions.delete(String(ctx.from.id));

  if (isOwner(ctx)) {
    return ctx.reply(
      `👑 ${BOT_NAME}\n\nOwner Panel`,
      ownerKeyboard()
    );
  }

  return ctx.reply(
    `👋 ${BOT_NAME} mein aapka swagat hai!\n\nApna menu select karein.`,
    userKeyboard()
  );
}

// =====================================
// CHANNEL INPUT HELPER
// =====================================

function normalizeChannelInput(value) {
  let input = String(value || "").trim();

  if (/^https?:\/\/(www\.)?t\.me\//i.test(input)) {
    try {
      const url = new URL(input);
      const slug = url.pathname.split("/").filter(Boolean)[0];

      if (!slug || slug.startsWith("+") || slug === "c") {
        return null;
      }

      return "@" + slug.replace(/^@/, "");
    } catch {
      return null;
    }
  }

  if (input.startsWith("@")) return input;

  if (/^-100\d+$/.test(input) || /^\d+$/.test(input)) {
    return input;
  }

  return null;
}

// =====================================
// ADD CHANNEL
// =====================================

async function startAddChannel(ctx) {
  if (!isOwner(ctx)) {
    return ctx.reply("❌ Sirf Owner channel add kar sakta hai.");
  }

  sessions.set(String(ctx.from.id), {
    action: "add_channel",
    step: "channel_input"
  });

  return ctx.reply(
    "➕ ADD CHANNEL\n\n" +
    "Channel ka @username ya Telegram Channel ID bhejein.\n\n" +
    "Example: @mychannel\n\n" +
    "Bot ko pehle channel mein Admin banana zaroori hai.\n\n" +
    "Cancel karne ke liye /cancel bhejein."
  );
}

async function processAddChannel(ctx, session, text) {
  const channelInput = normalizeChannelInput(text);

  if (!channelInput) {
    return ctx.reply(
      "❌ Channel details sahi nahi hain.\n\n" +
      "@username ya valid Telegram Channel ID bhejein."
    );
  }

  await ctx.reply("🔍 Channel verify ho raha hai...");

  try {
    const chat = await bot.telegram.getChat(channelInput);

    if (chat.type !== "channel") {
      return ctx.reply(
        "❌ Ye Telegram channel nahi hai. Kripya channel ka username ya ID bhejein."
      );
    }

    const member = await bot.telegram.getChatMember(
      chat.id,
      botInfo.id
    );

    const isAdmin =
      member.status === "administrator" ||
      member.status === "creator";

    if (!isAdmin) {
      return ctx.reply(
        "❌ Bot abhi is channel ka Admin nahi hai.\n\n" +
        "Pehle @PAPA_SAI_PANGA_BOT ko channel mein Admin banayein. " +
        "Uske baad dobara channel details bhejein."
      );
    }

    const channelName = chat.title || "Unnamed Channel";
    const channelUsername = chat.username
      ? "@" + chat.username
      : null;

    const channelLink = chat.username
      ? `https://t.me/${chat.username}`
      : chat.invite_link || null;

    const result = await supabaseRpc("add_bot_channel", {
      p_owner_telegram_id: String(ctx.from.id),
      p_channel_id: String(chat.id),
      p_channel_name: channelName,
      p_channel_username: channelUsername,
      p_channel_link: channelLink
    });

    if (!result?.ok) {
      if (result?.error === "CHANNEL_ALREADY_EXISTS") {
        sessions.delete(String(ctx.from.id));
        return ctx.reply("⚠️ Ye channel pehle se add hai.");
      }

      return ctx.reply(
        result?.message || "❌ Channel add nahi ho saka."
      );
    }

    await supabaseRpc("set_channel_bot_admin_status", {
      p_owner_telegram_id: String(ctx.from.id),
      p_channel_id: result.channel_db_id,
      p_is_admin: true
    });

    sessions.delete(String(ctx.from.id));

    return ctx.reply(
      "✅ CHANNEL SUCCESSFULLY ADDED!\n\n" +
      `📢 Name: ${channelName}\n` +
      `🆔 Telegram ID: ${chat.id}\n` +
      `👤 Username: ${channelUsername || "Private Channel"}\n` +
      "🤖 Bot Admin: Yes\n\n" +
      "Channel ab ZYNTRA BOT mein add ho gaya hai.",
      ownerKeyboard()
    );

  } catch (error) {
    console.error("Add channel error:", error);

    return ctx.reply(
      "❌ Channel verify nahi ho saka.\n\n" +
      "Check karein:\n" +
      "1. Channel ID/username sahi hai.\n" +
      "2. Bot channel mein Admin hai.\n" +
      "3. Bot ko channel access mila hua hai.\n\n" +
      "Dobara channel details bhejein."
    );
  }
}

// =====================================
// MANAGE CHANNELS
// =====================================

async function showManageChannels(ctx) {
  if (!isOwner(ctx)) {
    return ctx.reply("❌ Sirf Owner channels manage kar sakta hai.");
  }

  try {
    const result = await supabaseRpc("get_accessible_channels", {
      p_telegram_id: String(ctx.from.id)
    });

    if (!result?.ok) {
      return ctx.reply("❌ Channels load nahi ho sake.");
    }

    const channels = result.channels || [];

    if (!channels.length) {
      return ctx.reply(
        "📢 Abhi koi channel add nahi hai.\n\n" +
        "Add Channel button se pehla channel add karein.",
        ownerKeyboard()
      );
    }

    let message = "📢 MANAGE CHANNELS\n\n";
    message += `Total Channels: ${channels.length}\n\n`;

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];

      message += `${i + 1}. ${channel.channel_name}\n`;
      message += `🆔 ID: ${channel.channel_id}\n`;
      message += `👤 Username: ${channel.channel_username || "Private"}\n`;
      message += `🤖 Bot Admin: ${channel.bot_is_admin ? "Yes" : "No"}\n`;
      message += `📌 Status: ${channel.is_active ? "Active" : "Inactive"}\n`;

      if (channel.channel_link) {
        message += `🔗 ${channel.channel_link}\n`;
      }

      message += "\n";
    }

    return ctx.reply(message, ownerKeyboard());

  } catch (error) {
    console.error("Manage channels error:", error);

    return ctx.reply(
      "❌ Channels load karte waqt error aa gaya."
    );
  }
}

// =====================================
// START / CANCEL
// =====================================

bot.start(async (ctx) => {
  await showMainMenu(ctx);
});

bot.command("menu", async (ctx) => {
  await showMainMenu(ctx);
});

bot.command("cancel", async (ctx) => {
  sessions.delete(String(ctx.from.id));

  return ctx.reply(
    "❌ Current action cancel kar diya gaya.",
    isOwner(ctx) ? ownerKeyboard() : userKeyboard()
  );
});

// =====================================
// TEXT BUTTON HANDLERS
// =====================================

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const userId = String(ctx.from.id);

  if (text.startsWith("/")) return;

  const session = sessions.get(userId);

  // Process active input sessions before button matching.
  if (session) {
    if (session.action === "add_channel") {
      if (!isOwner(ctx)) {
        sessions.delete(userId);
        return ctx.reply("❌ Permission denied.");
      }

      return processAddChannel(ctx, session, text);
    }
  }

  // Normalize emoji-prefixed keyboard labels.
  const commandText = normalizeButtonText(text);
  const ownerButtons = BUTTONS.owner;
  const userButtons = BUTTONS.user;

  if (commandText === "Add Channel" && isOwner(ctx)) {
    return startAddChannel(ctx);
  }

  if (commandText === "Manage Channels" && isOwner(ctx)) {
    return showManageChannels(ctx);
  }

  if (commandText === "Bot Status" && isOwner(ctx)) {
    try {
      const me = await bot.telegram.getMe();
      const webhook = await bot.telegram.getWebhookInfo();

      return ctx.reply(
        "🤖 ZYNTRA BOT STATUS\n\n" +
        `Name: ${BOT_NAME}\n` +
        `Username: @${me.username}\n` +
        `Webhook: ${webhook.url ? "Active" : "Inactive"}\n` +
        `Pending Updates: ${webhook.pending_update_count || 0}\n` +
        "Database: Connected configuration",
        ownerKeyboard()
      );
    } catch (error) {
      console.error("Bot status error:", error);
      return ctx.reply("❌ Bot status check nahi ho saka.");
    }
  }

  const implementedOwnerButtons = [
    "Add Channel",
    "Manage Channels",
    "Bot Status"
  ];

  if (isOwner(ctx)) {
    const ownerLabels = Object.values(ownerButtons).map(normalizeButtonText);

    if (ownerLabels.includes(commandText) &&
        !implementedOwnerButtons.includes(commandText)) {
      return ctx.reply(
        "⏳ Ye feature abhi implement nahi hua hai.\n\n" +
        "Iska actual function agle development step mein add hoga.",
        ownerKeyboard()
      );
    }

    return ctx.reply(
      "Menu se koi option select karein.",
      ownerKeyboard()
    );
  }

  const userLabels = Object.values(userButtons).map(normalizeButtonText);

  if (userLabels.includes(commandText)) {
    return ctx.reply(
      "⏳ Ye feature abhi available nahi hai.\n\n" +
      "Kripya baad mein try karein.",
      userKeyboard()
    );
  }

  return ctx.reply(
    "Menu se koi option select karein.",
    userKeyboard()
  );
});

// =====================================
// ERROR HANDLER
// =====================================

bot.catch((error, ctx) => {
  console.error("Telegram update error:", error);

  if (ctx?.chat) {
    ctx.reply(
      "Kuch technical dikkat aa gayi. Dobara try karein."
    ).catch(() => {});
  }
});

// =====================================
// EXPRESS ROUTES
// =====================================

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: BOT_NAME,
    username: "@" + BOT_USERNAME,
    service: "Multi-Channel Voting Bot",
    mode: "Webhook"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: BOT_NAME,
    mode: "webhook"
  });
});

app.use(
  bot.webhookCallback("/telegram/webhook", {
    secretToken: WEBHOOK_SECRET
  })
);

// =====================================
// START SERVER
// =====================================

const server = app.listen(PORT, async () => {
  console.log(`${BOT_NAME} running on port ${PORT}`);

  try {
    botInfo = await bot.telegram.getMe();

    if (botInfo.username !== BOT_USERNAME) {
      throw new Error(
        `Username mismatch: @${botInfo.username}`
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

    console.log(`Webhook active: @${botInfo.username}`);
    console.log(`${BOT_NAME} is ready`);

  } catch (error) {
    console.error("Startup error:", error.message);
    server.close(() => process.exit(1));
  }
});

process.on("SIGTERM", () => {
  server.close(() => {
    console.log(`${BOT_NAME} stopped`);
  });
});
