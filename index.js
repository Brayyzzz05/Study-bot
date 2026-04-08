// ================= BOT (index.js) =================

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
    .setDescription("Ask AI (text or image)")
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
    .setName("quiz")
    .setDescription("Generate a quiz")
    .addStringOption(o =>
      o.setName("topic")
        .setDescription("Quiz topic")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("flashcard")
    .setDescription("Generate a flashcard")
    .addStringOption(o =>
      o.setName("topic")
        .setDescription("Flashcard topic")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timer")
    .setDescription("Start a study timer")
    .addIntegerOption(o =>
      o.setName("minutes")
        .setDescription("Time in minutes")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset conversation memory")
].map(cmd => cmd.toJSON());

// ================= REGISTER COMMANDS =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("🔄 Registering commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands
    });
    console.log("✅ Commands registered");
  } catch (err) {
    console.error("❌ Command registration failed:", err);
  }
})();

// ================= TIMER STORAGE =================
const timers = new Map();

// ================= INTERACTION HANDLER =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply(); // ✅ prevents timeout

    // ===== /ask =====
    if (interaction.commandName === "ask") {
      const question = interaction.options.getString("question");
      const attachment = interaction.options.getAttachment("image");

      // 📸 IMAGE MODE
      if (attachment) {
        const res = await axios.post(
          `${BACKEND_URL}/image`,
          {
            imageUrl: attachment.url,
            prompt: question || "Explain this image"
          },
          { timeout: 10000 }
        );

        return interaction.editReply(`🖼️ ${res.data.reply}`);
      }

      if (!question) {
        return interaction.editReply("❌ Please enter a question");
      }

      const res = await axios.post(
        `${BACKEND_URL}/chat`,
        {
          userId: interaction.user.id,
          message: question
        },
        { timeout: 10000 }
      );

      return interaction.editReply(`🧠 ${res.data.reply}`);
    }

    // ===== /quiz =====
    if (interaction.commandName === "quiz") {
      const topic = interaction.options.getString("topic");

      const res = await axios.post(
        `${BACKEND_URL}/quiz`,
        { topic },
        { timeout: 10000 }
      );

      return interaction.editReply(`🧪 ${res.data.reply}`);
    }

    // ===== /flashcard =====
    if (interaction.commandName === "flashcard") {
      const topic = interaction.options.getString("topic");

      const res = await axios.post(
        `${BACKEND_URL}/flashcard`,
        { topic },
        { timeout: 10000 }
      );

      return interaction.editReply(`🃏 ${res.data.reply}`);
    }

    // ===== /timer =====
    if (interaction.commandName === "timer") {
      const minutes = interaction.options.getInteger("minutes");
      const userId = interaction.user.id;

      if (timers.has(userId)) {
        return interaction.editReply("⏱ You already have a timer running");
      }

      const timeout = setTimeout(() => {
        interaction.followUp("⏱ Time’s up!");
        timers.delete(userId);
      }, minutes * 60000);

      timers.set(userId, timeout);

      return interaction.editReply(`⏱ Timer started for ${minutes} minutes`);
    }

    // ===== /reset =====
    if (interaction.commandName === "reset") {
      await axios.post(
        `${BACKEND_URL}/reset`,
        { userId: interaction.user.id },
        { timeout: 5000 }
      );

      return interaction.editReply("🧠 Memory reset!");
    }

  } catch (err) {
    console.error("❌ ERROR:", err.response?.data || err.message);
    return interaction.editReply("❌ Failed to contact backend");
  }
});

// ================= START BOT =================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);