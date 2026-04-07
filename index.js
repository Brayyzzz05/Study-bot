const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ChannelType, PermissionsBitField
} = require("discord.js");

const fs = require("fs");
const fetch = require("node-fetch");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== DATABASE =====
let data = {};
if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data[id]) {
    data[id] = {
      xp: 0,
      level: 1,
      minutes: 0,
      sessions: 0,
      streak: 0,
      lastStudy: 0,
      focusStart: null,
      memory: []
    };
  }
  return data[id];
}

// ===== LEVEL =====
function checkLevel(user) {
  const needed = user.level * 100;
  if (user.xp >= needed) {
    user.level++;
    user.xp = 0;
    return true;
  }
  return false;
}

function getRank(level) {
  if (level < 5) return "Beginner";
  if (level < 10) return "Grinder";
  if (level < 20) return "Scholar";
  return "Master";
}

// ===== STREAK =====
function updateStreak(user) {
  const now = Date.now();
  const day = 86400000;

  if (now - user.lastStudy < day * 2) {
    if (now - user.lastStudy > day) user.streak++;
  } else {
    user.streak = 1;
  }

  user.lastStudy = now;
}

// ===== AI TEXT (UPGRADED) =====
async function askText(prompt, memory) {
  const messages = [
    {
      role: "system",
      content: `
You are a powerful AI tutor.

Rules:
- Understand ANY language automatically
- Reply in the SAME language as the user
- Answer ANY topic (math, science, coding, history, etc.)
- Explain clearly step-by-step if needed
- Keep answers simple but accurate
- Break down difficult problems
      `
    },
    ...memory.slice(-5),
    { role: "user", content: prompt }
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages
    })
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "No response";
}

// ===== AI IMAGE (UPGRADED) =====
async function askImage(question, imageUrl) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are an AI that understands images.

Rules:
- Detect language automatically
- Reply in the user's language
- Solve problems in the image if present
- Explain step-by-step
          `
        },
        {
          role: "user",
          content: [
            { type: "text", text: question || "Explain this image" },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]
    })
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "No response";
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask AI (text or image)")
    .addStringOption(o =>
      o.setName("type")
        .setDescription("Question or image")
        .setRequired(true)
        .addChoices(
          { name: "question", value: "question" },
          { name: "image", value: "image" }
        )
    )
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(false)
    )
    .addAttachmentOption(o =>
      o.setName("image")
        .setDescription("Upload an image")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("focus")
    .setDescription("Start or stop focus mode")
    .addStringOption(o =>
      o.setName("action")
        .setDescription("Start or stop")
        .setRequired(true)
        .addChoices(
          { name: "start", value: "start" },
          { name: "stop", value: "stop" }
        )
    ),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View your stats"),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top users"),

  new SlashCommandBuilder()
    .setName("studyroom")
    .setDescription("Create a study room")
    .addStringOption(o =>
      o.setName("type")
        .setDescription("Public or private")
        .setRequired(true)
        .addChoices(
          { name: "public", value: "public" },
          { name: "private", value: "private" }
        )
    )
].map(c => c.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== AUTO DELETE VC =====
client.on("voiceStateUpdate", (oldState) => {
  if (oldState.channel && oldState.channel.members.size === 0) {
    oldState.channel.delete().catch(() => {});
  }
});

// ===== HANDLER =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const user = getUser(interaction.user.id);

  // ===== ASK =====
  if (interaction.commandName === "ask") {
    const type = interaction.options.getString("type");

    if (type === "question") {
      const question = interaction.options.getString("question");
      if (!question) return interaction.reply("❌ Enter a question!");

      await interaction.deferReply();

      const res = await askText(question, user.memory);

      user.memory.push({ role: "user", content: question });
      user.memory.push({ role: "assistant", content: res });

      return interaction.editReply(res);
    }

    if (type === "image") {
      const attachment = interaction.options.getAttachment("image");
      if (!attachment) return interaction.reply("❌ Upload an image!");

      await interaction.deferReply();

      const res = await askImage(
        "Explain and solve if it's a question",
        attachment.url
      );

      return interaction.editReply(res);
    }
  }

  // ===== FOCUS =====
  if (interaction.commandName === "focus") {
    const action = interaction.options.getString("action");

    if (action === "start") {
      user.focusStart = Date.now();
      return interaction.reply("🎯 Focus started!");
    }

    if (action === "stop" && user.focusStart) {
      const mins = Math.floor((Date.now() - user.focusStart) / 60000);

      user.minutes += mins;
      user.xp += mins * 3;

      updateStreak(user);
      const leveledUp = checkLevel(user);

      save();

      return interaction.reply(
        `🔥 ${mins} mins\nLevel: ${user.level} (${getRank(user.level)})` +
        (leveledUp ? "\n🎉 LEVEL UP!" : "")
      );
    }
  }

  // ===== STATS =====
  if (interaction.commandName === "stats") {
    return interaction.reply(
      `📊 Level: ${user.level} (${getRank(user.level)})
XP: ${user.xp}
Minutes: ${user.minutes}
Streak: ${user.streak}`
    );
  }

  // ===== LEADERBOARD =====
  if (interaction.commandName === "leaderboard") {
    const top = Object.entries(data)
      .sort((a, b) => b[1].level - a[1].level)
      .slice(0, 5);

    let text = "🏆 Leaderboard:\n";
    top.forEach((u, i) => {
      text += `${i + 1}. <@${u[0]}> - Lv ${u[1].level}\n`;
    });

    return interaction.reply(text);
  }

  // ===== STUDY ROOM =====
  if (interaction.commandName === "studyroom") {
    const type = interaction.options.getString("type");

    const channel = await interaction.guild.channels.create({
      name: `Study - ${interaction.user.username}`,
      type: ChannelType.GuildVoice,
      permissionOverwrites: type === "private" ? [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.Connect] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.Connect] }
      ] : []
    });

    return interaction.reply(`🎙 ${channel}`);
  }
});

client.login(TOKEN);
