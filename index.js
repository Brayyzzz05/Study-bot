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

// ===== CLIENT =====
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

// ===== MATH + ALGEBRA =====
function isMath(input) {
  return /^[\dxyz\+\-\*\/\^\(\)=\s]+$/i.test(input);
}

function detectIdentity(input) {
  const expr = input.replace(/\s+/g, "");

  if (/\(.+\+\.+\)\^2/.test(expr)) {
    return { answer: "a^2 + 2ab + b^2", explanation: "(a + b)^2 identity" };
  }

  if (/\(.+\-.*\)\^2/.test(expr)) {
    return { answer: "a^2 - 2ab + b^2", explanation: "(a - b)^2 identity" };
  }

  if (/\(.+\+.+\)\(.+\-.*\)/.test(expr)) {
    return { answer: "a^2 - b^2", explanation: "(a + b)(a - b) identity" };
  }

  return null;
}

function handleMath(input) {
  try {
    if (input.includes("=")) {
      const solved = nerdamer.solveEquations(input);
      return {
        answer: `x = ${solved.join(", ")}`,
        explanation: "Solved algebraically"
      };
    }

    const factored = nerdamer.factor(input).toString();
    if (factored !== input) {
      return {
        answer: factored,
        explanation: "Factored expression"
      };
    }

    const result = math.evaluate(input);
    return {
      answer: result.toString(),
      explanation: "Evaluated"
    };
  } catch {
    return null;
  }
}

// ===== QUIZ =====
function quiz(topic, user) {
  return {
    answer: `📚 Quiz: ${topic}`,
    explanation: `Level ${user.level}\n\nExplain ${topic} in your own words.`
  };
}

// ===== FLASHCARDS =====
function flashcards(topic) {
  return {
    answer: `🧾 Flashcards: ${topic}`,
    explanation: `Q: What is ${topic}?\nA: (Think and recall)`
  };
}

// ===== TIMER =====
const timers = new Map();

function startTimer(userId, mins) {
  timers.set(userId, Date.now() + mins * 60000);
  return `⏱️ Timer set for ${mins} minutes`;
}

function checkTimer(userId) {
  if (!timers.has(userId)) return null;
  const remaining = timers.get(userId) - Date.now();
  if (remaining <= 0) {
    timers.delete(userId);
    return "⏰ Time's up!";
  }
  return `⏳ ${Math.ceil(remaining / 1000)}s left`;
}

// ===== AI =====
async function askAI(prompt) {
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
            content: `STRICT FORMAT ONLY:

Answer: <answer>

Explanation:
<explanation>`
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

  // 🧠 Algebra identity FIRST
  const identity = detectIdentity(input);
  if (identity) return identity;

  // ⚡ Math
  if (isMath(input)) {
    const mathRes = handleMath(input);
    if (mathRes) return mathRes;
  }

  // 📚 Quiz
  if (input.startsWith("quiz ")) {
    const topic = input.replace("quiz ", "");
    return quiz(topic, user);
  }

  // 🧾 Flashcards
  if (input.startsWith("flashcards ")) {
    const topic = input.replace("flashcards ", "");
    return flashcards(topic);
  }

  // ⏱️ Timer
  if (input.startsWith("timer ")) {
    const mins = parseInt(input.replace("timer ", ""));
    return {
      answer: startTimer(user.id, mins),
      explanation: "Timer started"
    };
  }

  // 🤖 AI fallback
  const ai = await askAI(input);

  return {
    answer: ai,
    explanation: "AI response"
  };
}

// ===== COMMAND =====
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

    const result = await engine(question, { ...user, id: interaction.user.id });

    user.xp += 10;
    checkLevel(user);

    save();

    await interaction.editReply(
      `🧠 Answer:\n${result.answer}\n\n📖 Explanation:\n${result.explanation}`
    );
  }
});

client.login(TOKEN);