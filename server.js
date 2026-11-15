
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

// Temporary pending vote selections
const pendingVotes = new Map();

function isAdmin(ctx) {
  return ADMIN_IDS.includes(String(ctx.from.id));
}

// USER KEYBOARD
function userKeyboard() {
  return Markup.keyboard([
    ["Register Now 📝", "Vote 🗳️"]
  ]).resize();
}

// ADMIN KEYBOARD
function adminKeyboard() {
  return Markup.keyboard([
    ["Register Now 📝", "Vote 🗳️"],
    ["Admin Panel ⚙️"]
  ]).resize();
}

// ADMIN PANEL KEYBOARD
function adminPanelKeyboard() {
  return Markup.keyboard([
    ["Registration ON 🟢", "Registration OFF 🔴"],
    ["Voting ON 🟢", "Voting OFF 🔴"],
    ["Back to Menu"]
  ]).resize();
}

// MEMBERSHIP CHECK
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

// CHANNEL DETAILS
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
    [Markup.button.url(channels[0].title, channels[0].link)],
    [Markup.button.url(channels[1].title, channels[1].link)],
    [Markup.button.callback("Verify Membership", "verify_membership")]
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

// SETTINGS
async function getSettings() {
  const { data, error } = await supabase
    .from("voting_settings")
    .select("registration_active, voting_active")
    .eq("id", 1)
    .single();

  if (error) throw error;

  return data;
}

// MAIN MENU
async function showMainMenu(ctx, fullName) {
  const message =
    `Welcome ${fullName}!\n\n` +
    "DEMONS VOTING BOT mein aapka swagat hai.";

  return ctx.reply(
    message,
    isAdmin(ctx) ? adminKeyboard() : userKeyboard()
  );
}

// JOIN SCREEN
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

    if (!joined) return await showJoinScreen(ctx);

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

// ADMIN PANEL
bot.hears("Admin Panel ⚙️", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Access denied.");

  try {
    const settings = await getSettings();

    return ctx.reply(
      "⚙️ DEMONS ADMIN PANEL\n\n" +
      `Registration: ${settings.registration_active ? "ON 🟢" : "OFF 🔴"}\n` +
      `Voting: ${settings.voting_active ? "ON 🟢" : "OFF 🔴"}`,
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

  return ctx.reply("Registration ON ho gaya! 🟢", adminPanelKeyboard());
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

  return ctx.reply("Registration OFF ho gaya! 🔴", adminPanelKeyboard());
});

// VOTING ON
bot.hears("Voting ON 🟢", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Access denied.");

  const { error } = await supabase
    .from("voting_settings")
    .update({ voting_active: true })
    .eq("id", 1);

  if (error) {
    console.error(error);
    return ctx.reply("Voting ON nahi hua.");
  }

  return ctx.reply("Voting ON ho gaya! 🟢", adminPanelKeyboard());
});

// VOTING OFF
bot.hears("Voting OFF 🔴", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Access denied.");

  const { error } = await supabase
    .from("voting_settings")
    .update({ voting_active: false })
    .eq("id", 1);

  if (error) {
    console.error(error);
    return ctx.reply("Voting OFF nahi hua.");
  }

  return ctx.reply("Voting OFF ho gaya! 🔴", adminPanelKeyboard());
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
    if (!(await checkMembership(ctx.from.id))) {
      return await showJoinScreen(ctx);
    }

    const settings = await getSettings();

    if (!settings.registration_active) {
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
      console.error("Announcement error:", results);
    }

    return ctx.reply(
      bothSent
        ? "🎉 Registration successful!\nDetails dono channels par post ho gayi hain."
        : "Registration successful hai, lekin announcement mein problem aayi. Admin se contact karein.",
      isAdmin(ctx) ? adminKeyboard() : userKeyboard()
    );

  } catch (error) {
    console.error("Registration error:", error);
    return ctx.reply("Technical problem. Dobara try karein.");
  }
});

// VOTE MENU
bot.hears("Vote 🗳️", async (ctx) => {
  try {
    if (!(await checkMembership(ctx.from.id))) {
      return await showJoinScreen(ctx);
    }

    const settings = await getSettings();

    if (!settings.voting_active) {
      return ctx.reply("Voting abhi shuru nahi hui hai.");
    }

    const { data: participants, error } = await supabase
      .from("voting_participants")
      .select("id, display_name, total_votes")
      .order("id", { ascending: true });

    if (error) throw error;

    if (!participants || participants.length === 0) {
      return ctx.reply("Abhi koi registered participant nahi hai.");
    }

    const buttons = participants.map((participant) => [
      Markup.button.callback(
        participant.display_name.substring(0, 55),
        `select_participant_${participant.id}`
      )
    ]);

    return ctx.reply(
      "🗳️ VOTE MENU\n\n" +
      "Jis participant ko vote dena hai, uska naam select karein:",
      Markup.inlineKeyboard(buttons)
    );

  } catch (error) {
    console.error("Vote menu error:", error);
    return ctx.reply("Vote menu load nahi hua.");
  }
});

// SELECT PARTICIPANT
bot.action(/^select_participant_(\d+)$/, async (ctx) => {
  try {
    if (!(await checkMembership(ctx.from.id))) {
      await ctx.answerCbQuery("Dono channels join karein.", {
        show_alert: true
      });
      return await showJoinScreen(ctx);
    }

    const settings = await getSettings();

    if (!settings.voting_active) {
      return ctx.answerCbQuery("Voting band hai.", {
        show_alert: true
      });
    }

    const participantId = Number(ctx.match[1]);

    const { data: participant, error } = await supabase
      .from("voting_participants")
      .select("id, display_name")
      .eq("id", participantId)
      .single();

    if (error || !participant) {
      return ctx.answerCbQuery("Participant nahi mila.", {
        show_alert: true
      });
    }

    pendingVotes.set(String(ctx.from.id), participantId);

    await ctx.answerCbQuery("Participant selected!");

    // UPDATED VOTE NUMBER PROMPT
    return ctx.reply(
      "🗳️ DEMONS VOTING\n\n" +
      `Aapne select kiya: ${participant.display_name}\n\n` +
      "1 Coin = 1 Vote\n" +
      "Jitne Coins spend karoge, utne hi Votes milenge.\n\n" +
      "Enter Vote Number\n\n" +
      "Example: 10\n\n" +
      "Example: 10 enter karne par 10 Coins deduct honge aur " +
      `${participant.display_name} ko 10 Votes milenge.\n\n` +
      "Enter your vote number below."
    );

  } catch (error) {
    console.error("Participant selection error:", error);
    return ctx.answerCbQuery("Problem hui. Dobara try karein.", {
      show_alert: true
    });
  }
});

// HANDLE COIN AMOUNT
bot.on("text", async (ctx) => {
  const telegramId = String(ctx.from.id);

  if (!pendingVotes.has(telegramId)) return;

  const participantId = pendingVotes.get(telegramId);
  const amountText = ctx.message.text.trim();

  if (!/^[1-9]\d*$/.test(amountText)) {
    return ctx.reply("Kripya Coins ki sahi positive sankhya bhejein.");
  }

  const coins = Number(amountText);

  if (!Number.isSafeInteger(coins)) {
    return ctx.reply("Coin amount bahut bada hai. Sahi amount bhejein.");
  }

  try {
    if (!(await checkMembership(ctx.from.id))) {
      pendingVotes.delete(telegramId);
      return await showJoinScreen(ctx);
    }

    const result = await supabase.rpc("cast_voting_coins", {
      p_voter_telegram_id: telegramId,
      p_participant_id: participantId,
      p_coins: coins
    });

    if (result.error) {
      console.error("Vote RPC error:", result.error);
      return ctx.reply("Vote process nahi ho paya. Admin se contact karein.");
    }

    const data = result.data;

    if (!data || !data.success) {
      pendingVotes.delete(telegramId);

      const messages = {
        "Insufficient coins": "Aapke paas itne Coins nahi hain.",
        "Voting is closed": "Voting abhi band hai.",
        "Participant not found": "Participant nahi mila.",
        "User not found": "Aapka account nahi mila."
      };

      return ctx.reply(
        messages[data?.message] || data?.message || "Vote nahi laga."
      );
    }

    pendingVotes.delete(telegramId);

    return ctx.reply(
      "✅ VOTE SUCCESSFUL!\n\n" +
      `Votes added: ${data.votes_added}\n` +
      `Remaining Coins: ${data.remaining_coins}`,
      isAdmin(ctx) ? adminKeyboard() : userKeyboard()
    );

  } catch (error) {
    console.error("Vote processing error:", error);
    return ctx.reply("Technical problem. Dobara try karein.");
  }
});

// HOME
app.get("/", (req, res) => {
  res.send("DEMONS VOTING BOT is running");
});

// HEALTH
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// WEBHOOK
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
                   
