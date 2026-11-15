
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

// Admin Telegram IDs
const ADMIN_IDS = ["7927224931", "8789888284"];

// Telegram channels
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

// Check channel membership
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

// Save user
async function saveUser(ctx) {
  const telegramId = String(ctx.from.id);

  const fullName = [
    ctx.from.first_name,
    ctx.from.last_name
  ].filter(Boolean).join(" ");

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

  return fullName || "User";
}

// Get registration setting
async function getRegistrationStatus() {
  const { data, error } = await supabase
    .from("voting_settings")
    .select("registration_active")
    .eq("id", 1)
    .single();

  if (error) throw error;

  return data.registration_active;
}

// Main menu
async function showMainMenu(ctx, fullName) {
  const active = await getRegistrationStatus();

  const buttons = [];

  if (active) {
    buttons.push([
      Markup.button.callback("Register Now", "register_now")
    ]);
  }

  if (isAdmin(ctx)) {
    buttons.push([
      Markup.button.callback("Admin Panel", "admin_panel")
    ]);
  }

  const message =
    `Welcome ${fullName}!\n\n` +
    "DEMONS VOTING BOT mein aapka swagat hai.";

  return ctx.reply(
    message,
    buttons.length ? Markup.inlineKeyboard(buttons) : undefined
  );
}

// Get actual Telegram channel titles
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

// Join keyboard
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
      Markup.button.callback(
        "Verify Membership",
        "verify_membership"
      )
    ]
  ]);
}

// Show join screen
async function showJoinScreen(ctx) {
  const keyboard = await joinKeyboard();

  return ctx.reply(
    "Welcome to DEMONS VOTING BOT!\n\n" +
    "Bot use karne ke liye dono Telegram channels join karein.\n\n" +
    "Dono channels join karne ke baad Verify button dabayein.",
    keyboard
  );
}

// Start command
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
      "Problem aa rahi hai. Bot ko dono channels mein Admin banayein aur dobara /start karein."
    );
  }
});

// Verify membership
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
    await ctx.reply("Membership verified successfully!");

    return await showMainMenu(ctx, fullName);

  } catch (error) {
    console.error("Verify error:", error);

    return ctx.answerCbQuery(
      "Verification failed. Dobara try karein.",
      { show_alert: true }
    );
  }
});

// Admin panel
bot.action("admin_panel", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Access denied!", {
      show_alert: true
    });
  }

  try {
    const active = await getRegistrationStatus();

    await ctx.answerCbQuery();

    return ctx.reply(
      `ADMIN PANEL\n\nRegistration: ${active ? "ON" : "OFF"}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Registration ON",
            "registration_on"
          )
        ],
        [
          Markup.button.callback(
            "Registration OFF",
            "registration_off"
          )
        ],
        [
          Markup.button.callback(
            "Refresh Status",
            "admin_panel"
          )
        ]
      ])
    );

  } catch (error) {
    console.error("Admin panel error:", error);
    return ctx.reply("Admin Panel load nahi hua.");
  }
});

// Turn registration ON
bot.action("registration_on", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Access denied!", {
      show_alert: true
    });
  }

  const { error } = await supabase
    .from("voting_settings")
    .update({ registration_active: true })
    .eq("id", 1);

  if (error) {
    console.error(error);
    return ctx.answerCbQuery("Setting update nahi hui.", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery("Registration ON ho gaya!");
  return ctx.reply("Registration ab ON hai.");
});

// Turn registration OFF
bot.action("registration_off", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Access denied!", {
      show_alert: true
    });
  }

  const { error } = await supabase
    .from("voting_settings")
    .update({ registration_active: false })
    .eq("id", 1);

  if (error) {
    console.error(error);
    return ctx.answerCbQuery("Setting update nahi hui.", {
      show_alert: true
    });
  }

  await ctx.answerCbQuery("Registration OFF ho gaya!");
  return ctx.reply("Registration ab OFF hai.");
});

// Register user
bot.action("register_now", async (ctx) => {
  try {
    const joined = await checkMembership(ctx.from.id);

    if (!joined) {
      return ctx.answerCbQuery(
        "Dono channels join karna zaroori hai!",
        { show_alert: true }
      );
    }

    const active = await getRegistrationStatus();

    if (!active) {
      return ctx.answerCbQuery(
        "Registration abhi band hai.",
        { show_alert: true }
      );
    }

    const telegramId = String(ctx.from.id);

    const fullName = [
      ctx.from.first_name,
      ctx.from.last_name
    ].filter(Boolean).join(" ") || "User";

    const displayName = ctx.from.username
      ? `${fullName} (@${ctx.from.username})`
      : fullName;

    // Insert only once. Database unique constraint prevents duplicates.
    const { error } = await supabase
      .from("voting_participants")
      .insert({
        telegram_id: telegramId,
        display_name: displayName
      });

    if (error) {
      if (error.code === "23505") {
        return ctx.answerCbQuery(
          "Aap pehle hi register kar chuke hain!",
          { show_alert: true }
        );
      }

      console.error("Registration error:", error);

      return ctx.answerCbQuery(
        "Registration nahi ho paya. Dobara try karein.",
        { show_alert: true }
      );
    }

    await ctx.answerCbQuery("Registration successful!");

    const announcement =
      "🎉 NEW PARTICIPANT REGISTERED!\n\n" +
      `Name: ${fullName}\n` +
      `Telegram ID: ${telegramId}\n\n` +
      "DEMONS VOTING BOT";

    // Send separate announcement to both channels
    const results = await Promise.allSettled(
      CHANNELS.map(channel =>
        bot.telegram.sendMessage(
          channel.username,
          announcement
        )
      )
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Announcement failed for ${CHANNELS[index].username}:`,
          result.reason
        );
      }
    });

    const bothSent = results.every(
      result => result.status === "fulfilled"
    );

    if (bothSent) {
      return ctx.reply(
        "🎉 Aapka Registration successful ho gaya!\n\n" +
        "Aapki details dono channels par post kar di gayi hain."
      );
    }

    return ctx.reply(
      "Registration successful ho gaya, lekin channel announcement mein problem aayi. Admin se contact karein."
    );

  } catch (error) {
    console.error("Register action error:", error);

    try {
      return ctx.answerCbQuery(
        "Kuch technical problem hui. Dobara try karein.",
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
