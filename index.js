const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");

const fs = require("fs");
const fetch = require("node-fetch");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates]
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

// ===== AI =====
async function askAI(prompt, memory) {
  const messages = [
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

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("ask").setDescription("Ask AI (text or photo)"),

  new SlashCommandBuilder().setName("focus").setDescription("Focus mode")
    .addStringOption(o => o.setName("action").setRequired(true)
      .addChoices({ name: "start", value: "start" }, { name: "stop", value: "stop" })),

  new SlashCommandBuilder().setName("stats").setDescription("Stats"),

  new SlashCommandBuilder().setName("leaderboard").setDescription("Top users"),

  new SlashCommandBuilder().setName("studyroom").setDescription("Create room")
    .addStringOption(o => o.setName("type").setRequired(true)
      .addChoices({ name: "public", value: "public" }, { name: "private", value: "private" }))
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

// ===== MAIN HANDLER =====
client.on("interactionCreate", async interaction => {

  // ===== SLASH COMMAND =====
  if (interaction.isChatInputCommand()) {

    const user = getUser(interaction.user.id);

    if (interaction.commandName === "ask") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ask_text").setLabel("📝 Question").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ask_image").setLabel("🖼 Photo").setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: "Choose how you want to ask:",
        components: [row]
      });
    }

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
          `🔥 Studied ${mins} mins\nLevel: ${user.level} (${getRank(user.level)})` +
          (leveledUp ? "\n🎉 LEVEL UP!" : "")
        );
      }
    }

    if (interaction.commandName === "stats") {
      return interaction.reply(
        `📊 Level: ${user.level} (${getRank(user.level)})
XP: ${user.xp}
Minutes: ${user.minutes}
Streak: ${user.streak}`
      );
    }

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
  }

  // ===== BUTTON HANDLER =====
  if (interaction.isButton()) {

    const user = getUser(interaction.user.id);

    // TEXT MODE
    if (interaction.customId === "ask_text") {
      await interaction.reply("✏️ Type your question:");

      const filter = m => m.author.id === interaction.user.id;
      const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });

      const msg = collected.first();
      if (!msg) return interaction.followUp("❌ Time expired");

      const res = await askAI(`Explain clearly:\n${msg.content}`, user.memory);

      user.memory.push({ role: "user", content: msg.content });
      user.memory.push({ role: "assistant", content: res });

      return interaction.followUp(res);
    }

    // IMAGE MODE
    if (interaction.customId === "ask_image") {
      await interaction.reply("📷 Upload an image:");

      const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
      const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000 });

      const msg = collected.first();
      if (!msg) return interaction.followUp("❌ No image");

      const imageUrl = msg.attachments.first().url;

      return interaction.followUp(`🖼 Image received!\n${imageUrl}`);
    }
  }

});

client.login(TOKEN);
