const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.TOKEN;
const BACKEND_URL = process.env.BACKEND_URL;

// ================== 🧠 MATH ENGINE ==================
function solveMath(input) {
  try {
    // basic arithmetic
    if (/^[0-9+\-*/(). x^]+$/.test(input)) {
      const result = Function(`return (${input.replace(/x/g, "*")})`)();
      return {
        answer: String(result),
        explanation: "Computed using local math engine"
      };
    }

    // detect quadratic (x^2)
    if (/x\^2/.test(input)) {
      return {
        answer: "Quadratic detected",
        explanation: "Sent to AI for solving (factorisation / expansion)"
      };
    }

    return null;

  } catch {
    return null;
  }
}

// ================== 🤖 AI CALL ==================
async function askAI(prompt) {
  try {
    const res = await axios.post(`${BACKEND_URL}/chat`, {
      userId: "discord",
      message: prompt
    });

    return res.data.reply;

  } catch {
    return "❌ AI unavailable";
  }
}

// ================== 🧪 QUIZ ==================
async function generateQuiz(topic) {
  const res = await axios.post(`${BACKEND_URL}/quiz`, { topic });

  return res.data.reply;
}

// ================== 🃏 FLASHCARDS ==================
async function generateFlashcard(topic) {
  const res = await axios.post(`${BACKEND_URL}/flashcard`, { topic });

  return res.data.reply;
}

// ================== 📸 IMAGE ==================
async function solveImage(imageUrl, prompt) {
  const res = await axios.post(`${BACKEND_URL}/image`, {
    imageUrl,
    prompt
  });

  return res.data.reply;
}

// ================== ⏱ TIMER STORAGE ==================
const timers = new Map();

// ================== BOT ==================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  try {
    // ================== /ask ==================
    if (interaction.commandName === "ask") {
      const question = interaction.options.getString("question");
      const attachment = interaction.options.getAttachment("image");

      // 📸 IMAGE
      if (attachment) {
        const result = await solveImage(attachment.url, question || "Explain this image");
        return interaction.editReply(`🖼️ Answer:\n${result}`);
      }

      // 🧠 MATH
      const math = solveMath(question);
      if (math) {
        return interaction.editReply(
          `🧠 Answer: ${math.answer}\n\n📖 Explanation: ${math.explanation}`
        );
      }

      // 🤖 AI
      const ai = await askAI(question);
      return interaction.editReply(`🧠 Answer:\n${ai}`);
    }

    // ================== /quiz ==================
    if (interaction.commandName === "quiz") {
      const topic = interaction.options.getString("topic");

      const quiz = await generateQuiz(topic);

      return interaction.editReply(`🧪 Quiz:\n${quiz}`);
    }

    // ================== /flashcard ==================
    if (interaction.commandName === "flashcard") {
      const topic = interaction.options.getString("topic");

      const card = await generateFlashcard(topic);

      return interaction.editReply(`🃏 Flashcard:\n${card}`);
    }

    // ================== /timer ==================
    if (interaction.commandName === "timer") {
      const minutes = interaction.options.getInteger("minutes");

      const userId = interaction.user.id;

      if (timers.has(userId)) {
        return interaction.editReply("⏱ You already have a timer running.");
      }

      const timeout = setTimeout(() => {
        interaction.followUp(`⏱ Timer finished!`);
        timers.delete(userId);
      }, minutes * 60 * 1000);

      timers.set(userId, timeout);

      return interaction.editReply(`⏱ Timer started for ${minutes} minutes`);
    }

  } catch (err) {
    console.log(err);
    return interaction.editReply("❌ Error occurred.");
  }
});

client.login(TOKEN);