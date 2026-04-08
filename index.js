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

// 🔗 YOUR BACKEND
const BACKEND_URL = process.env.BACKEND_URL;

// ================== 🧠 BACKEND FUNCTIONS ==================

async function askBackend(question) {
  const res = await axios.post(`${BACKEND_URL}/chat`, {
    message: question
  });
  return res.data.reply;
}

async function askImage(imageUrl, prompt) {
  const res = await axios.post(`${BACKEND_URL}/image`, {
    imageUrl,
    prompt
  });
  return res.data.reply;
}

async function getQuiz(topic) {
  const res = await axios.post(`${BACKEND_URL}/quiz`, {
    topic
  });
  return res.data.reply;
}

async function getFlashcard(topic) {
  const res = await axios.post(`${BACKEND_URL}/flashcard`, {
    topic
  });
  return res.data.reply;
}

// ================== ⚡ COMMANDS ==================

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
        .setDescription("Minutes")
        .setRequired(true)
    )
].map(c => c.toJSON());

// ================== 🚀 REGISTER ==================

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ================== ⏱ TIMER ==================

const timers = new Map();

// ================== 🎮 HANDLER ==================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  try {
    // ================== /ask ==================
    if (interaction.commandName === "ask") {
      const question = interaction.options.getString("question");
      const attachment = interaction.options.getAttachment("image");

      // 📸 IMAGE MODE
      if (attachment) {
        const reply = await askImage(
          attachment.url,
          question || "Explain this image"
        );

        return interaction.editReply(`🖼️ ${reply}`);
      }

      // 🧠 TEXT MODE
      if (!question) {
        return interaction.editReply("❌ Please enter a question");
      }

      const reply = await askBackend(question);

      return interaction.editReply(`🧠 ${reply}`);
    }

    // ================== /quiz ==================
    if (interaction.commandName === "quiz") {
      const topic = interaction.options.getString("topic");

      const reply = await getQuiz(topic);

      return interaction.editReply(`🧪 ${reply}`);
    }

    // ================== /flashcard ==================
    if (interaction.commandName === "flashcard") {
      const topic = interaction.options.getString("topic");

      const reply = await getFlashcard(topic);

      return interaction.editReply(`🃏 ${reply}`);
    }

    // ================== /timer ==================
    if (interaction.commandName === "timer") {
      const minutes = interaction.options.getInteger("minutes");
      const userId = interaction.user.id;

      if (timers.has(userId)) {
        return interaction.editReply("⏱ You already have a timer running.");
      }

      const timeout = setTimeout(() => {
        interaction.followUp("⏱ Time’s up!");
        timers.delete(userId);
      }, minutes * 60 * 1000);

      timers.set(userId, timeout);

      return interaction.editReply(`⏱ Timer set for ${minutes} minutes`);
    }

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);

    return interaction.editReply("❌ Failed to contact AI backend");
  }
});

// ================== START ==================

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);