const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");

const fs = require("fs");
const fetch = require("node-fetch");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
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
  if (!data[id]) data[id] = { score: 0, memory: [] };
  return data[id];
}

// ===== CACHE =====
let cache = {};
const getCache = k => cache[k];
const setCache = (k, v) => cache[k] = v;

// ===== QUICK ANSWER =====
function quickAnswer(input) {
  const text = input.toLowerCase().trim();

  if (/^[0-9+\-*/().\s]+$/.test(text)) {
    try {
      return "🧠 " + Function(`return (${text})`)();
    } catch {}
  }

  if (text === "hi") return "👋 Hello!";
  return null;
}

// ===== AI =====
async function askText(prompt, memory) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Answer clearly and shortly." },
          ...memory.slice(-2),
          { role: "user", content: prompt }
        ]
      })
    });

    clearTimeout(timeout);

    if (!res.ok) return "⚠️ API error";

    const json = await res.json();
    return json.choices?.[0]?.message?.content || "⚠️ No response";

  } catch {
    return "⚠️ AI timeout";
  }
}

// ===== QUIZ GENERATOR =====
async function generateQuiz(topic) {
  try {
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
            content: "Return ONLY valid JSON like: [{\"q\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"answer\":\"A\"}]"
          },
          { role: "user", content: topic }
        ]
      })
    });

    const json = await res.json();

    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);

    // ✅ ensure strings
    parsed[0].options = parsed[0].options.map(o => String(o));

    return parsed;

  } catch (err) {
    console.error("QUIZ ERROR:", err);
    return null;
  }
}

// ===== COMMANDS (FIXED) =====
const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask AI")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question") // ✅ FIXED
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Interactive quiz")
    .addStringOption(o =>
      o.setName("topic")
        .setDescription("Quiz topic") // ✅ FIXED
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("flashcards")
    .setDescription("Flashcards")
    .addStringOption(o =>
      o.setName("topic")
        .setDescription("Flashcard topic") // ✅ FIXED
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("score")
    .setDescription("View your score")
].map(c => c.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== QUIZ STATE =====
let activeQuizzes = {};

// ===== HANDLER =====
client.on("interactionCreate", async interaction => {

  // ===== BUTTONS =====
  if (interaction.isButton()) {
    const [quizId, choice] = interaction.customId.split("_");
    const quiz = activeQuizzes[quizId];
    if (!quiz) return;

    const user = getUser(interaction.user.id);

    if (choice === quiz.answer) {
      user.score++;
      save();
      return interaction.reply({ content: "✅ Correct!", ephemeral: true });
    } else {
      return interaction.reply({
        content: `❌ Wrong! Answer: ${quiz.answer}`,
        ephemeral: true
      });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const user = getUser(interaction.user.id);

  // ===== ASK =====
  if (interaction.commandName === "ask") {
    const question = interaction.options.getString("question");

    await interaction.deferReply();

    const quick = quickAnswer(question);
    if (quick) return interaction.editReply(quick);

    const cached = getCache(question);
    if (cached) return interaction.editReply("⚡ " + cached);

    const res = await askText(question, user.memory);

    setCache(question, res);

    return interaction.editReply(res);
  }

  // ===== QUIZ =====
  if (interaction.commandName === "quiz") {
    const topic = interaction.options.getString("topic");

    await interaction.deferReply();

    const quizData = await generateQuiz(topic);
    if (!quizData) return interaction.editReply("❌ Failed to generate quiz");

    const q = quizData[0];
    const quizId = Date.now().toString();

    activeQuizzes[quizId] = { answer: String(q.answer) };

    const row = new ActionRowBuilder().addComponents(
      q.options.map(opt =>
        new ButtonBuilder()
          .setCustomId(`${quizId}_${opt}`)
          .setLabel(String(opt)) // ✅ FORCE STRING
          .setStyle(ButtonStyle.Primary)
      )
    );

    return interaction.editReply({
      content: `📝 ${q.q}`,
      components: [row]
    });
  }

  // ===== FLASHCARDS =====
  if (interaction.commandName === "flashcards") {
    const topic = interaction.options.getString("topic");

    await interaction.deferReply();

    const res = await askText(`Create flashcards for ${topic}`, []);
    return interaction.editReply(res);
  }

  // ===== SCORE =====
  if (interaction.commandName === "score") {
    return interaction.reply(`🏆 Score: ${user.score}`);
  }
});

client.login(TOKEN);