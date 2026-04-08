const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const fetch = require("node-fetch");
const math = require("mathjs");
const nerdamer = require("nerdamer/all.min");

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== STORAGE =====
let data = {};
if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data[id]) {
    data[id] = { xp: 0, level: 1 };
  }
  return data[id];
}

function levelUp(user) {
  if (user.xp >= user.level * 100) {
    user.level++;
    user.xp = 0;
  }
}

// ===== INPUT CHECK =====
function isMath(input) {
  return /^[\dxyz\+\-\*\/\^\(\)=\s]+$/i.test(input);
}

// ===== FACTOR DETECTION (CORE FIX) =====
function analyzeExpression(input) {
  try {
    const clean = input.replace(/\s+/g, "");

    const factored = nerdamer.factor(clean).toString();

    // ✅ If factoring changed → factorable
    if (factored !== clean) {
      return {
        answer: factored,
        explanation: "This expression is factorable"
      };
    }

    // ❌ Try solving
    if (clean.includes("x")) {
      const roots = nerdamer.solveEquations(clean + "=0");

      if (roots && roots.length > 0) {
        return {
          answer: `Roots: ${roots.join(", ")}`,
          explanation: "Not factorable into simple integers, but solvable"
        };
      }
    }

    return {
      answer: clean,
      explanation: "Not factorable"
    };

  } catch (err) {
    console.log("MATH ERROR:", err);

    return {
      answer: "❌ Error",
      explanation: "Math processing failed"
    };
  }
}

// ===== QUIZ =====
function quiz(topic, user) {
  return {
    answer: `📚 Quiz started: ${topic}`,
    explanation: `Explain ${topic} in detail.`
  };
}

// ===== FLASHCARDS =====
function flashcards(topic) {
  return {
    answer: `🧾 Flashcards: ${topic}`,
    explanation: `Q: What is ${topic}?\nA: (Try to recall)`
  };
}

// ===== TIMER =====
const timers = new Map();

function startTimer(userId, mins) {
  timers.set(userId, Date.now() + mins * 60000);

  setTimeout(() => {
    timers.delete(userId);
  }, mins * 60000);

  return `⏱️ Timer set for ${mins} minutes`;
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
            content: `STRICT FORMAT:

Answer: <answer>

Explanation:
<explanation>`
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await res.json();

    if (!data.choices || !data.choices[0]) {
      return "⚠️ No AI response";
    }

    return data.choices[0].message.content;

  } catch (err) {
    console.log("AI ERROR:", err);
    return "❌ AI failed";
  }
}

// ===== ENGINE =====
async function engine(input, user) {
  input = input.toLowerCase();

  // 🧠 Math FIRST
  if (isMath(input)) {
    return analyzeExpression(input);
  }

  // 📚 Quiz
  if (input.startsWith("quiz ")) {
    return quiz(input.replace("quiz ", ""), user);
  }

  // 🧾 Flashcards
  if (input.startsWith("flashcards ")) {
    return flashcards(input.replace("flashcards ", ""));
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
    .addStringOption(option =>
      option.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// ===== REGISTER =====
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
    levelUp(user);
    save();

    await interaction.editReply(
      `🧠 Answer:\n${result.answer}\n\n📖 Explanation:\n${result.explanation}`
    );
  }
});

client.login(TOKEN);