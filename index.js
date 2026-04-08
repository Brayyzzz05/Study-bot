const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder
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

// ===== QUICK ANSWER =====
function quickAnswer(input) {
  const text = input.toLowerCase().trim();

  if (/^[0-9+\-*/().\s]+$/.test(text)) {
    try {
      return Function(`return (${text})`)();
    } catch {}
  }

  return null;
}

// ===== AI TEXT =====
async function askFormatted(prompt, memory) {
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
          {
            role: "system",
            content: `
Always reply in this format:

Answer: <answer>

Explanation:
<steps>
            `
          },
          ...memory.slice(-2),
          { role: "user", content: prompt }
        ]
      })
    });

    clearTimeout(timeout);

    const json = await res.json();
    return json.choices?.[0]?.message?.content || "No response";

  } catch {
    return "⚠️ AI timeout";
  }
}

// ===== AI IMAGE =====
async function askWithImage(prompt, imageUrl) {
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
            content: `
Answer in format:

Answer: <answer>

Explanation:
<steps>
            `
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt || "Solve this" },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ]
      })
    });

    const json = await res.json();
    return json.choices?.[0]?.message?.content || "No response";

  } catch {
    return "⚠️ Image AI failed";
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
            content: "Return JSON: [{\"q\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"answer\":\"A\"}]"
          },
          { role: "user", content: topic }
        ]
      })
    });

    const json = await res.json();
    return JSON.parse(json.choices[0].message.content);

  } catch {
    return null;
  }
}

// ===== COMMANDS =====
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
        .setDescription("Upload image")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("quiz")
    .setDescription("Interactive quiz")
    .addStringOption(o =>
      o.setName("topic")
        .setDescription("Quiz topic")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("flashcards")
    .setDescription("Generate flashcards")
    .addStringOption(o =>
      o.setName("topic")
        .setDescription("Topic")
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

// ===== INTERACTIONS =====
client.on("interactionCreate", async interaction => {

  // BUTTON HANDLING
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
    const image = interaction.options.getAttachment("image");

    await interaction.deferReply();

    let result;

    if (image) {
      result = await askWithImage(question, image.url);
    } else if (question) {
      const quick = quickAnswer(question);

      if (quick !== null) {
        result = `Answer: ${quick}\n\nExplanation:\nCalculated instantly.`;
      } else {
        result = await askFormatted(question, user.memory);
      }
    } else {
      return interaction.editReply("❌ Provide a question or image");
    }

    // CLEAN EMBED UI
    const [answerPart, explanationPart] = result.split("Explanation:");

    const embed = new EmbedBuilder()
      .setTitle("🧠 AI Answer")
      .setColor(0x5865F2)
      .addFields(
        {
          name: "✅ Answer",
          value: answerPart.replace("Answer:", "").trim() || "No answer"
        },
        {
          name: "📘 Explanation",
          value: explanationPart?.trim() || "No explanation"
        }
      )
      .setFooter({ text: "Study Bot" });

    return interaction.editReply({ embeds: [embed] });
  }

  // ===== QUIZ =====
  if (interaction.commandName === "quiz") {
    const topic = interaction.options.getString("topic");

    await interaction.deferReply();

    const quizData = await generateQuiz(topic);
    if (!quizData) return interaction.editReply("❌ Failed to generate quiz");

    const q = quizData[0];
    const id = Date.now().toString();

    activeQuizzes[id] = { answer: q.answer };

    const row = new ActionRowBuilder().addComponents(
      q.options.map(opt =>
        new ButtonBuilder()
          .setCustomId(`${id}_${opt}`)
          .setLabel(opt)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const embed = new EmbedBuilder()
      .setTitle("📝 Quiz")
      .setDescription(q.q)
      .setColor(0x00C896);

    return interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }

  // ===== FLASHCARDS =====
  if (interaction.commandName === "flashcards") {
    const topic = interaction.options.getString("topic");

    await interaction.deferReply();

    const res = await askFormatted(`Create flashcards for ${topic}`, []);

    const embed = new EmbedBuilder()
      .setTitle("🧾 Flashcards")
      .setDescription(res)
      .setColor(0xF39C12);

    return interaction.editReply({ embeds: [embed] });
  }

  // ===== SCORE =====
  if (interaction.commandName === "score") {
    return interaction.reply(`🏆 Score: ${user.score}`);
  }
});

client.login(TOKEN);