const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const fetch = require("node-fetch");
const math = require("mathjs");
const nerdamer = require("nerdamer/all.min");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== ENV =====
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
    data[id] = { xp: 0, level: 1, memory: [] };
  }
  return data[id];
}

function checkLevel(user) {
  if (user.xp >= user.level * 100) {
    user.level++;
    user.xp = 0;
  }
}

// ===== DETECT =====
function detectType(input) {
  const text = input.toLowerCase();

  if (/[\dxyz\+\-\*\/\^\(\)=]/.test(input)) return "math";
  if (text.startsWith("quiz ")) return "quiz";
  if (text.startsWith("flashcard ")) return "flashcard";

  return "ai";
}

// ===== MATH ENGINE =====
function isMath(input) {
  return /^[\dxyz\+\-\*\/\^\(\)=\s]+$/i.test(input);
}

function handleMath(input) {
  try {
    // Solve equation
    if (input.includes("=")) {
      const result = nerdamer.solveEquations(input);
      return {
        answer: `x = ${result.join(", ")}`,
        explanation: "Solved using algebra engine"
      };
    }

    // Factor
    const factored = nerdamer.factor(input).toString();
    if (factored !== input) {
      return {
        answer: factored,
        explanation: "Factored using symbolic math"
      };
    }

    // Expand
    const expanded = nerdamer.expand(input).toString();

    return {
      answer: expanded,
      explanation: "Expanded expression"
    };

  } catch {
    return null;
  }
}

// ===== QUIZ =====
function makeQuiz(topic, user) {
  return {
    answer: `📚 Quiz: ${topic}`,
    explanation: `
Level: ${user.level}

${user.level < 3 ? `
1. What is ${topic}?
2. Give a simple example.
` : `
1. Explain ${topic} in detail
2. Give real-world application
3. Solve a problem
`}
`
  };
}

// ===== FLASHCARDS =====
function makeFlashcards(topic) {
  return {
    answer: `🧾 Flashcards: ${topic}`,
    explanation: `
Q: What is ${topic}?
A: Definition

Q: Key concept?
A: Core idea

Q: Example?
A: Usage
`
  };
}

// ===== STRICT AI =====
async function askAI(prompt, user) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `
STRICT FORMAT:

Answer: <answer>

Explanation:
<explanation>

No extra text.
            `
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const json = await res.json();
    return json.choices?.[0]?.message?.content || "No response";
  } catch {
    return "❌ AI error";
  }
}

// ===== ENGINE =====
async function engine(input, user) {

  // ⚡ MATH FIRST
  if (isMath(input)) {
    const mathResult = handleMath(input);
    if (mathResult) return mathResult;
  }

  const type = detectType(input);

  if (type === "quiz") {
    const topic = input.replace("quiz", "").trim();
    return makeQuiz(topic, user);
  }

  if (type === "flashcard") {
    const topic = input.replace("flashcard", "").trim();
    return makeFlashcards(topic);
  }

  // 🤖 AI
  const ai = await askAI(input, user);

  return {
    answer: ai,
    explanation: "AI response"
  };
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask anything")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    )
].map(c => c.toJSON());

// REGISTER
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== BOT =====
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ask") {
    const user = getUser(interaction.user.id);
    const question = interaction.options.getString("question");

    await interaction.deferReply();

    const result = await engine(question, user);

    user.xp += 10;
    checkLevel(user);

    save();

    await interaction.editReply(
      `🧠 Answer:\n${result.answer}\n\n📖 Explanation:\n${result.explanation}`
    );
  }
});

client.login(TOKEN);