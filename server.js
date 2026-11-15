
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

const pendingVotes = new Map();
const pendingRegistrations = new Set();

const PARTICIPANTS_PER_PAGE = 20;

function isAdmin(ctx) {
  return ADMIN_IDS.includes(String(ctx.from.id));
}

// USER KEYBOARD
function userKeyboard() {
  return Markup.keyboard([
    ["Register Now 📝", "Add Votes 🗳️"],
    ["See All Participants 👥"]
  ]).resize();
}

// ADMIN KEYBOARD
function adminKeyboard() {
  return Markup.keyboard([
    ["Register Now 📝", "Add Votes 🗳️"],
    ["See All Participants 👥"],
    ["Admin Panel ⚙️"]
  ]).resize();
}

// ADMIN PANEL
function adminPanelKeyboard() {
  return Markup.keyboard([
    ["Registration ON 🟢", "Registration OFF 🔴"],
    ["Start New 🔄"],
    ["Back to Menu"]
  ]).resize();
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
    .select("registration_active")
    .eq("id", 1)
    .single();

  if (error) throw error;

  return data;
}

// MAIN MENU
async function showMainMenu(ctx, fullName) {
  return ctx.reply(
    `Welcome ${fullName}!\n\n` +
    "DEMONS VOTING BOT mein aapka swagat hai.",
    isAdmin(ctx) ? adminKeyboard() : userKeyboard()
  );
}

// CHANNEL POST KEYBOARD
function channelVoteKeyboard(participantId, totalVotes) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `Vote - ${totalVotes}`,
        `free_vote_${participantId}`
      )
    ]
  ]);
}

// UPDATE BOTH CHANNEL VOTE COUNTS
async function updateChannelVoteCounts(participantId) {
  const { data: participant, error } = await supabase
    .from("voting_participants")
    .select("total_votes, channel_message_ids")
    .eq("id", participantId)
    .single();

  if (error) throw error;
  if (!participant) return;

  const messageIds = participant.channel_message_ids || {};

  const results = await Promise.allSettled(
    CHANNELS.map(channel => {
      const messageId = messageIds[channel.username];

      if (!messageId) return Promise.resolve();

      return bot.telegram.editMessageReplyMarkup(
        channel.username,
        messageId,
        undefined,
        channelVoteKeyboard(
          participantId,
          participant.total_votes
        ).reply_markup
      );
    })
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        "Channel count update failed:",
        CHANNELS[index].username,
        result.reason
      );
    }
  });
}

// CREATE POSTS IN BOTH CHANNELS
async function publishParticipant(participant) {
  const messageIds = {};

  const message =
    "🎉 DEMONS GIVEAWAY\n\n" +
    `😎 Name: ${participant.display_name}\n` +
    `❤️ ID: ${participant.telegram_id}`;

  for (const channel of CHANNELS) {
    const sent = await bot.telegram.sendMessage(
      channel.username,
      message,
      channelVoteKeyboard(participant.id, participant.total_votes)
    );

    messageIds[channel.username] = sent.message_id;
  }

  const { error } = await supabase
    .from("voting_participants")
    .update({ channel_message_ids: messageIds })
    .eq("id", participant.id);

  if (error) throw error;
}

// DELETE OLD CHANNEL POSTS
async function deleteOldChannelPosts(participants) {
  for (const participant of participants) {
    const messageIds = participant.channel_message_ids || {};

    for (const channel of CHANNELS) {
      const messageId = messageIds[channel.username];

      if (!messageId) continue;

      try {
        await bot.telegram.deleteMessage(
          channel.username,
          messageId
        );
      } catch (error) {
        console.error(
          "Old post delete failed:",
          channel.username,
          messageId,
          error.description || error.message
        );
      }
    }
  }
}

// START - NO MEMBERSHIP REQUIRED
bot.start(async (ctx) => {
  try {
    const fullName = await saveUser(ctx);
    return await showMainMenu(ctx, fullName);
  } catch (error) {
    console.error("Start error:", error);
    return ctx.reply("Welcome load nahi hua. Dobara try karein.");
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
      "Voting: ALWAYS ON 🟢",
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

// START NEW
bot.hears("Start New 🔄", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Access denied.");

  return ctx.reply(
    "⚠️ START NEW VOTING ROUND\n\n" +
    "Purane participants aur vote records delete honge.\n" +
    "Purane channel posts bhi delete karne ki koshish hogi.\n\n" +
    "Coins aur payment records safe rahenge.\n\n" +
    "Kya aap new round start karna chahte hain?",
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ CONFIRM NEW ROUND", "confirm_new_round")],
      [Markup.button.callback("❌ CANCEL", "cancel_new_round")]
    ])
  );
});

// CANCEL NEW ROUND
bot.action("cancel_new_round", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Access denied.", { show_alert: true });
  }

  await ctx.answerCbQuery("Cancelled");
  return ctx.editMessageText("Start New cancel kar diya gaya hai.");
});

// CONFIRM NEW ROUND
bot.action("confirm_new_round", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("Access denied.", { show_alert: true });
  }

  try {
    await ctx.answerCbQuery("New round process ho raha hai...");

    const { data: oldParticipants, error: fetchError } = await supabase
      .from("voting_participants")
      .select("id, channel_message_ids");

    if (fetchError) throw fetchError;

    const { data, error } = await supabase.rpc(
      "start_new_voting_round"
    );

    if (error) throw error;

    if (!data || !data.success) {
      return ctx.editMessageText("New round start nahi hua.");
    }

    pendingVotes.clear();
    pendingRegistrations.clear();

    await deleteOldChannelPosts(oldParticipants || []);

    return ctx.editMessageText(
      "✅ NEW VOTING ROUND STARTED!\n\n" +
      `Old participants deleted: ${data.deleted_participants}\n` +
      `Old votes deleted: ${data.deleted_votes}\n` +
      `Old free votes deleted: ${data.deleted_free_votes || 0}\n\n` +
      "Registration: ON 🟢\n" +
      "Voting: ALWAYS ON 🟢"
    );

  } catch (error) {
    console.error("Start New error:", error);
    return ctx.editMessageText(
      "New round start nahi hua. Admin logs check karein."
    );
  }
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

// REGISTER NOW - ASK CUSTOM NAME
bot.hears("Register Now 📝", async (ctx) => {
  try {
    const settings = await getSettings();

    if (!settings.registration_active) {
      return ctx.reply("Registration abhi band hai.");
    }

    const telegramId = String(ctx.from.id);

    const { data: existing, error } = await supabase
      .from("voting_participants")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (error) throw error;

    if (existing) {
      return ctx.reply("Aap is round mein pehle hi register kar chuke hain!");
    }

    pendingRegistrations.add(telegramId);

    return ctx.reply(
      "📝 DEMONS GIVEAWAY REGISTRATION\n\n" +
      "Apna display name type karke send karein.\n\n" +
      "Aap jo naam bhejenge, wahi dono channels par show hoga.\n" +
      "Aapki Telegram ID automatically add hogi."
    );

  } catch (error) {
    console.error("Registration start error:", error);
    return ctx.reply("Registration start nahi ho paya.");
  }
});

// SEE ALL PARTICIPANTS
async function showParticipants(ctx, page = 0, edit = false) {
  const from = page * PARTICIPANTS_PER_PAGE;
  const to = from + PARTICIPANTS_PER_PAGE - 1;

  const { data, error, count } = await supabase
    .from("voting_participants")
    .select("id, display_name, total_votes", { count: "exact" })
    .order("total_votes", { ascending: false })
    .range(from, to);

  if (error) throw error;

  if (!count || !data || data.length === 0) {
    if (edit) {
      return ctx.editMessageText(
        "Abhi koi participant registered nahi hai."
      );
    }

    return ctx.reply("Abhi koi participant registered nahi hai.");
  }

  const totalPages = Math.ceil(count / PARTICIPANTS_PER_PAGE);

  let message =
    "👥 ALL PARTICIPANTS\n\n" +
    `Total Participants: ${count}\n` +
    `Page: ${page + 1}/${totalPages}\n\n`;

  data.forEach((participant, index) => {
    message +=
      `${from + index + 1}. ${participant.display_name}\n` +
      `Votes: ${participant.total_votes}\n\n`;
  });

  const buttons = [];

  if (page > 0) {
    buttons.push(
      Markup.button.callback("⬅️ Previous", `participants_page_${page - 1}`)
    );
  }

  if (page + 1 < totalPages) {
    buttons.push(
      Markup.button.callback("Next ➡️", `participants_page_${page + 1}`)
    );
  }

  const keyboard = buttons.length
    ? Markup.inlineKeyboard([buttons])
    : undefined;

  if (edit) return ctx.editMessageText(message, keyboard);

  return ctx.reply(message, keyboard);
}

bot.hears("See All Participants 👥", async (ctx) => {
  try {
    return await showParticipants(ctx, 0);
  } catch (error) {
    console.error("Participants list error:", error);
    return ctx.reply("Participants list load nahi hui.");
  }
});

bot.action(/^participants_page_(\d+)$/, async (ctx) => {
  try {
    const page = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    return await showParticipants(ctx, page, true);
  } catch (error) {
    console.error(error);
    return ctx.answerCbQuery("List load nahi hui.", {
      show_alert: true
    });
  }
});

// ADD VOTES - COIN VOTING
bot.hears("Add Votes 🗳️", async (ctx) => {
  try {
    const { data: participants, error } = await supabase
      .from("voting_participants")
      .select("id, display_name, total_votes")
      .order("id", { ascending: true });

    if (error) throw error;

    if (!participants || participants.length === 0) {
      return ctx.reply("Abhi koi registered participant nahi hai.");
    }

    const buttons = participants.map(participant => [
      Markup.button.callback(
        `${participant.display_name.substring(0, 35)} (${participant.total_votes})`,
        `select_participant_${participant.id}`
      )
    ]);

    return ctx.reply(
      "🗳️ COIN VOTING\n\n" +
      "Participant select karein.\n" +
      "1 Coin = 1 Vote",
      Markup.inlineKeyboard(buttons)
    );

  } catch (error) {
    console.error("Vote menu error:", error);
    return ctx.reply("Vote menu load nahi hua.");
  }
});

// FREE VOTE FROM CHANNEL POST
bot.action(/^free_vote_(\d+)$/, async (ctx) => {
  try {
    const participantId = Number(ctx.match[1]);
    const telegramId = String(ctx.from.id);

    const result = await supabase.rpc("cast_free_vote", {
      p_voter_telegram_id: telegramId,
      p_participant_id: participantId
    });

    if (result.error) {
      console.error("Free vote RPC error:", result.error);
      return ctx.answerCbQuery("Vote process nahi hua.", {
        show_alert: true
      });
    }

    if (!result.data || !result.data.success) {
      return ctx.answerCbQuery(
        result.data?.message === "Already voted"
          ? "Aap apna free vote pehle hi de chuke hain."
          : "Vote nahi ho paya.",
        { show_alert: true }
      );
    }

    await updateChannelVoteCounts(participantId);

    return ctx.answerCbQuery(
      "Free vote successful! Total votes: " +
      result.data.total_votes,
      { show_alert: true }
    );

  } catch (error) {
    console.error("Free vote error:", error);
    return ctx.answerCbQuery("Technical problem. Dobara try karein.", {
      show_alert: true
    });
  }
});

// SELECT PARTICIPANT FOR COIN VOTE
bot.action(/^select_participant_(\d+)$/, async (ctx) => {
  try {
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

    return ctx.reply(
      "🗳️ DEMONS VOTING\n\n" +
      `Aapne select kiya: ${participant.display_name}\n\n` +
      "1 Coin = 1 Vote\n" +
      "Jitne Coins spend karoge, utne hi Votes milenge.\n\n" +
      "Enter Vote Number\n\n" +
      "Example: 10\n\n" +
      `10 Coins se ${participant.display_name} ko 10 Votes milenge.\n\n` +
      "Enter your vote number below."
    );

  } catch (error) {
    console.error("Participant selection error:", error);
    return ctx.answerCbQuery("Problem hui. Dobara try karein.", {
      show_alert: true
    });
  }
});

// HANDLE USER TEXT
bot.on("text", async (ctx) => {
  const telegramId = String(ctx.from.id);
  const text = ctx.message.text.trim();

  // CUSTOM REGISTRATION NAME
  if (pendingRegistrations.has(telegramId)) {
    if (text.startsWith("/")) return;

    if (text.length < 2 || text.length > 50) {
      return ctx.reply("Naam 2 se 50 characters ke beech hona chahiye.");
    }

    try {
      const settings = await getSettings();

      if (!settings.registration_active) {
        pendingRegistrations.delete(telegramId);
        return ctx.reply("Registration abhi band hai.");
      }

      const { data: existing, error: existingError } = await supabase
        .from("voting_participants")
        .select("id")
        .eq("telegram_id", telegramId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        pendingRegistrations.delete(telegramId);
        return ctx.reply("Aap is round mein pehle hi register kar chuke hain!");
      }

      const { data: inserted, error } = await supabase
        .from("voting_participants")
        .insert({
          telegram_id: telegramId,
          display_name: text,
          total_votes: 0,
          free_votes: 0
        })
        .select("id, telegram_id, display_name, total_votes")
        .single();

      if (error) throw error;

      pendingRegistrations.delete(telegramId);

      let publishError = null;

      try {
        await publishParticipant(inserted);
      } catch (error) {
        publishError = error;
        console.error("Channel publishing error:", error);
      }

      return ctx.reply(
        publishError
          ? "Registration successful hai, lekin channel post mein problem aayi. Admin se contact karein."
          : "🎉 Registration successful!\n\n" +
            `Name: ${text}\n` +
            `Telegram ID: ${telegramId}\n\n` +
            "Dono channels par aapka post publish ho gaya hai.",
        isAdmin(ctx) ? adminKeyboard() : userKeyboard()
      );

    } catch (error) {
      console.error("Custom registration error:", error);
      return ctx.reply("Registration nahi ho paya. Dobara try karein.");
    }
  }

  // COIN VOTE AMOUNT
  if (!pendingVotes.has(telegramId)) return;

  const participantId = pendingVotes.get(telegramId);

  if (!/^[1-9]\d*$/.test(text)) {
    return ctx.reply("Kripya Coins ki sahi positive sankhya bhejein.");
  }

  const coins = Number(text);

  if (!Number.isSafeInteger(coins)) {
    return ctx.reply("Coin amount bahut bada hai. Sahi amount bhejein.");
  }

  try {
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

    await updateChannelVoteCounts(participantId);

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
