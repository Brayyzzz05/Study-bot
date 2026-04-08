const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const axios = require("axios");
const math = require("mathjs");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ================= AI =================
async function askAI(prompt) {
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
You are a powerful AI study tutor.

RULES:
- Always respond in:
Answer:
Explanation:
- Solve math step-by-step
- Teach clearly
- Be concise but accurate
`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (err) {
    console.log(err);
    return "❌ AI error";
  }
}

// ================= MATH =================
function tryMath(input) {
  try {
    const result = math.evaluate(input);
    return `Answer: ${result}\nExplanation: Calculated using math engine`;
  } catch {
    return null;
  }
}

// ================= ENGINE =================
async function engine(input) {

  // 1. MATH FIRST
  const mathRes = tryMath(input);
  if (mathRes) return mathRes;

  // 2. AI
  return await askAI(input);
}

// ================= QUIZ =================
async function generateQuiz(topic) {
  return await askAI(`Create a quiz question about ${topic} with answer and explanation`);
}

// ================= FLASHCARD =================
async function generateFlashcard(topic) {
  return await askAI(`Create a flashcard about ${topic}`);
}

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask the AI anything")
    .addStringOption(opt =>
      opt.setName("question")
        .setDescription("Your question")
        .setRequired(false)
    )
    .addAttachmentOption(opt =>
      opt.setName("image")
        .setDescription("Upload image")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Generate a quiz")
    .addStringOption(opt =>
      opt.setName("topic")
        .setDescription("Topic")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("flashcard")
    .setDescription("Generate flashcard")
    .addStringOption(opt =>
      opt.setName("topic")
        .setDescription("Topic")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("study")
    .setDescription("Start study mode")
    .addStringOption(opt =>
      opt.setName("topic")
        .setDescription("Topic")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("timer")
    .setDescription("Focus timer")
    .addIntegerOption(opt =>
      opt.setName("minutes")
        .setDescription("Minutes")
        .setRequired(true)
    )
].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: commands
  });
})();

// ================= BOT =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ASK
  if (interaction.commandName === "ask") {
    const q = interaction.options.getString("question") || "Explain a topic";
    const img = interaction.options.getAttachment("image");

    await interaction.deferReply();

    if (img) {
      const ai = await askAI("Analyze this image and explain it.");
      return interaction.editReply(ai);
    }

    const res = await engine(q);
    return interaction.editReply(res);
  }

  // QUIZ
  if (interaction.commandName === "quiz") {
    const topic = interaction.options.getString("topic");

    const quiz = await generateQuiz(topic);

    return interaction.reply(`🧠 Quiz:\n${quiz}`);
  }

  // FLASHCARD
  if (interaction.commandName === "flashcard") {
    const topic = interaction.options.getString("topic");

    const card = await generateFlashcard(topic);

    return interaction.reply(`📚 Flashcard:\n${card}`);
  }

  // STUDY MODE
  if (interaction.commandName === "study") {
    const topic = interaction.options.getString("topic");

    const lesson = await askAI(`Teach ${topic} step-by-step like a teacher`);

    return interaction.reply(`📖 Study Mode:\n${lesson}`);
  }

  // TIMER
  if (interaction.commandName === "timer") {
    const minutes = interaction.options.getInteger("minutes");

    await interaction.reply(`⏱ Timer started for ${minutes} minutes`);

    setTimeout(() => {
      interaction.followUp("⏰ Time’s up!");
    }, minutes * 60000);
  }
});

client.login(TOKEN);