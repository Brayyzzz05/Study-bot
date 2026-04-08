const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const BACKEND_URL = process.env.BACKEND_URL;

// ================= COMMANDS =================

const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask AI")
    .addStringOption(o =>
      o.setName("question").setDescription("Your question")
    )
    .addAttachmentOption(o =>
      o.setName("image").setDescription("Upload image")
    ),

  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Generate quiz")
    .addStringOption(o =>
      o.setName("topic").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("flashcard")
    .setDescription("Generate flashcard")
    .addStringOption(o =>
      o.setName("topic").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timer")
    .setDescription("Study timer")
    .addIntegerOption(o =>
      o.setName("minutes").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset memory")
].map(c => c.toJSON());

// REGISTER
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands
  });
})();

// ================= TIMER =================
const timers = new Map();

// ================= HANDLER =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  try {
    // ===== /ask =====
    if (interaction.commandName === "ask") {
      const question = interaction.options.getString("question");
      const attachment = interaction.options.getAttachment("image");

      if (attachment) {
        const res = await axios.post(`${BACKEND_URL}/image`, {
          imageUrl: attachment.url,
          prompt: question || "Explain this"
        });

        return interaction.editReply(`🖼️ ${res.data.reply}`);
      }

      if (!question) {
        return interaction.editReply("❌ Enter a question");
      }

      const res = await axios.post(`${BACKEND_URL}/chat`, {
        userId: interaction.user.id,
        message: question
      });

      return interaction.editReply(`🧠 ${res.data.reply}`);
    }

    // ===== /quiz =====
    if (interaction.commandName === "quiz") {
      const topic = interaction.options.getString("topic");

      const res = await axios.post(`${BACKEND_URL}/quiz`, {
        topic
      });

      return interaction.editReply(`🧪 ${res.data.reply}`);
    }

    // ===== /flashcard =====
    if (interaction.commandName === "flashcard") {
      const topic = interaction.options.getString("topic");

      const res = await axios.post(`${BACKEND_URL}/flashcard`, {
        topic
      });

      return interaction.editReply(`🃏 ${res.data.reply}`);
    }

    // ===== /timer =====
    if (interaction.commandName === "timer") {
      const minutes = interaction.options.getInteger("minutes");
      const userId = interaction.user.id;

      if (timers.has(userId)) {
        return interaction.editReply("⏱ Timer already running");
      }

      const timeout = setTimeout(() => {
        interaction.followUp("⏱ Time’s up!");
        timers.delete(userId);
      }, minutes * 60000);

      timers.set(userId, timeout);

      return interaction.editReply(`⏱ ${minutes} min timer started`);
    }

    // ===== /reset =====
    if (interaction.commandName === "reset") {
      await axios.post(`${BACKEND_URL}/reset`, {
        userId: interaction.user.id
      });

      return interaction.editReply("🧠 Memory cleared");
    }

  } catch (err) {
    console.log(err.response?.data || err.message);
    return interaction.editReply("❌ Error contacting backend");
  }
});

// START
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);