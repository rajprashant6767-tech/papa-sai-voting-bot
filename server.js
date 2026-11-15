
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const bot = new Telegraf(BOT_TOKEN);

const ADMIN_IDS = ["7927224931", "8789888284"];

const CHANNELS = [
  {
    username: "@DEMONS_GIVEAWAY_2026_27",
    link: "https://t.me/DEMONS_GIVEAWAY_2026_27"
  },
  {
    username: "@ZyloBet",
    link: "https://t.me/ZyloBet"
  }
];

function isAdmin(ctx) {
  return ADMIN_IDS.includes(String(ctx.from.id));
}

// USER BOTTOM KEYBOARD
function userKeyboard() {
  return Markup.keyboard([
    ["Register Now 📝", "Vote 🗳️"]
  ]).resize();
}

// ADMIN BOTTOM KEYBOARD
function adminKeyboard() {
  return Markup.keyboard([
    ["Register Now 📝", "Vote 🗳️"],
    ["Admin Panel ⚙️"]
  ]).resize();
}

// ADMIN PANEL BOTTOM KEYBOARD
function adminPanelKeyboard() {
  return Markup.keyboard([
    ["Registration ON 🟢", "Registration OFF 🔴"],
    ["Back to Menu"]
  ]).resize();
}

// CHECK MEMBERSHIP
async function checkMembership(telegramId) {
  for (const channel of CHANNELS) {
    const member = await bot.telegram.getChatMember(
      channel.username,
      telegramId
    );

    const joined =
      ["creator", "administrator", "member"].includes(member.status) ||
      (member.status === "restricted" && member.is_member === true);

    if (!joined) return false;
  }

  return true;
}

// GET CHANNEL TITLES
async function getChannelDetails() {
  const details = [];

  for (const channel of CHANNELS) {
    const chat = await bot.telegram.getChat(channel.username);

    details.push({
      title: chat.title,
      link: channel.link
    });
  }

  return details;
}

// JOIN KEYBOARD
async function joinKeyboard() {
  const channels = await getChannelDetails();

  return Markup.inlineKeyboard([
    [
      Markup.button.url(channels[0].title, channels[0].link)
    ],
    [
      Markup.button.url(channels[1].title, channels[1].link)
    ],
    [
      Markup.button.callback("Verify Membership", "verify_membership")
    ]
  ]);
}

// SAVE USER
async function saveUser(ctx) {
  const telegramId = String(ctx.from.id);

  const fullName = [
    ctx.from.first_name,
    ctx.from.last_name
  ].filter(Boolean).join(" ") || "User";

  const { error } = await supabase
    .from("bot_users")
    .upsert({
      telegram_id: telegramId,
      username: ctx.from.username || null,
      full_name: fullName
    }, {
      onConflict: "telegram_id"
    });

  if (error) throw error;

  return fullName;
}

// REGISTRATION STATUS
async function getRegistrationStatus() {
  const { data, error } = await supabase
    .from("voting_settings")
    .select("registration_active")
    .eq("id", 1)
    .single();

  if (error) throw error;

  return data.registration_active;
}

// SHOW MAIN MENU
async function showMainMenu(ctx, fullName) {
  const message =
    `Welcome ${fullName}!\n\n` +
    "DEMONS VOTING BOT mein aapka swagat hai.";

  return ctx.reply(
    message,
    isAdmin(ctx) ? adminKeyboard() : userKeyboard()
  );
}

// SHOW JOIN SCREEN
async function showJoinScreen(ctx) {
  const keyboard = await joinKeyboard();

  return ctx.reply(
    "Welcome to DEMONS VOTING BOT!\n\n" +
    "Bot use karne ke liye dono Telegram channels join karein.\n\n" +
    "Dono channels join karne ke baad Verify button dabayein.",
    keyboard
  );
}

// START
bot.start(async (ctx) => {
  try {
    const joined = await checkMembership(ctx.from.id);

    if (!joined) {
      return await showJoinScreen(ctx);
    }

    const fullName = await saveUser(ctx);
    return await showMainMenu(ctx, fullName);

  } catch (error) {
    console.error("Start error:", error);

    return ctx.reply(
      "Membership check nahi ho paya. Dono channels mein Bot ko Admin banayein."
    );
  }
});

// VERIFY
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

    const fullName = await saveUser(ctx);
    return await showMainMenu(ctx, fullName);

  } catch (error) {
    console.error("Verify error:", error);

    return ctx.answerCbQuery(
      "Verification failed. Dobara try karein.",
      { show_alert: true }
    );
  }
});

// ADMIN PANEL BUTTON
bot.hears("Admin Panel ⚙️", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply("Access denied.");
  }

  try {
    const active = await getRegistrationStatus();

    return ctx.reply(
      "⚙️ DEMONS ADMIN PANEL\n\n" +
      `Registration: ${active ? "ON 🟢" : "OFF 🔴"}`,
      adminPanelKeyboard()
    );

  } catch (error) {
    console.error(error);
    return ctx.reply("Admin Panel load nahi hua.");
  }
});

// REGISTRATION ON
bot.hears("Registration ON 🟢", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Access denied.");

  const { error } = await supabase
    .from("voting_settings")
    .update({ registration_active: true })
    .eq("id", 1);

  if (error) {
    console.error(error);
    return ctx.reply("Registration ON nahi hua.");
  }

  return ctx.reply(
    "Registration ON ho gaya! 🟢",
    adminPanelKeyboard()
  );
});

// REGISTRATION OFF
bot.hears("Registration OFF 🔴", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Access denied.");

  const { error } = await supabase
    .from("voting_settings")
    .update({ registration_active: false })
    .eq("id", 1);

  if (error) {
    console.error(error);
    return ctx.reply("Registration OFF nahi hua.");
  }

  return ctx.reply(
    "Registration OFF ho gaya! 🔴",
    adminPanelKeyboard()
  );
});

// BACK TO MENU
bot.hears("Back to Menu", async (ctx) => {
  try {
    const fullName = await saveUser(ctx);
    return await showMainMenu(ctx, fullName);
  } catch (error) {
    console.error(error);
    return ctx.reply("Menu load nahi hua.");
  }
});

// REGISTER NOW
bot.hears("Register Now 📝", async (ctx) => {
  try {
    const joined = await checkMembership(ctx.from.id);

    if (!joined) {
      return await showJoinScreen(ctx);
    }

    const active = await getRegistrationStatus();

    if (!active) {
      return ctx.reply("Registration abhi band hai.");
    }

    const telegramId = String(ctx.from.id);

    const fullName = [
      ctx.from.first_name,
      ctx.from.last_name
    ].filter(Boolean).join(" ") || "User";

    const displayName = ctx.from.username
      ? `${fullName} (@${ctx.from.username})`
      : fullName;

    const { error } = await supabase
      .from("voting_participants")
      .insert({
        telegram_id: telegramId,
        display_name: displayName
      });

    if (error) {
      if (error.code === "23505") {
        return ctx.reply("Aap pehle hi register kar chuke hain!");
      }

      console.error(error);
      return ctx.reply("Registration nahi ho paya.");
    }

    const announcement =
      "🎉 NEW PARTICIPANT REGISTERED!\n\n" +
      `Name: ${fullName}\n` +
      `Telegram ID: ${telegramId}\n\n` +
      "DEMONS VOTING BOT";

    const results = await Promise.allSettled(
      CHANNELS.map(channel =>
        bot.telegram.sendMessage(channel.username, announcement)
      )
    );

    const bothSent = results.every(
      result => result.status === "fulfilled"
    );

    if (!bothSent) {
      console.error("One or more channel announcements failed:", results);
    }

    return ctx.reply(
      bothSent
        ? "🎉 Registration successful!\nAapki details dono channels par post ho gayi hain."
        : "Registration successful hai, lekin announcement mein problem aayi. Admin se contact karein.",
      isAdmin(ctx) ? adminKeyboard() : userKeyboard()
    );

  } catch (error) {
    console.error("Registration error:", error);
    return ctx.reply("Technical problem. Dobara try karein.");
  }
});

// VOTE PLACEHOLDER
bot.hears("Vote 🗳️", async (ctx) => {
  return ctx.reply(
    "Voting abhi shuru nahi hui hai. Voting start hone par yahan option milega."
  );
});

// HOME
app.get("/", (req, res) => {
  res.send("DEMONS VOTING BOT is running");
});

// HEALTH
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// TELEGRAM WEBHOOK
app.post("/telegram", async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(500);
  }
});

// SERVER START
app.listen(PORT, async () => {
  console.log(`DEMONS VOTING BOT running on port ${PORT}`);

  if (APP_URL) {
    try {
      await bot.telegram.setWebhook(
        `${APP_URL.replace(/\/$/, "")}/telegram`
      );

      console.log("Webhook configured");
    } catch (error) {
      console.error("Webhook setup error:", error);
    }
  }
});
