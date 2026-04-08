const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fetch = require("node-fetch");
const math = require("mathjs");
const nerdamer = require("nerdamer/all.min");
const fs = require("fs");

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== DATA =====
let data = {};
if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data[id]) data[id] = { xp: 0, level: 1 };
  return data[id];
}

function levelUp(user) {
  if (user.xp >= user.level * 100) {
    user.level++;
    user.xp = 0;
  }
}

// ===== UTIL =====
function isMath(input) {
  return /^[\dxyz\+\-\*\/\^\(\)=\s]+$/i.test(input);
}

// ===== MATH ENGINE =====
function solveMath(input) {
  try {
    const clean = input.replace(/\s+/g, "");

    // EQUATIONS
    if (clean.includes("=")) {
      const solved = nerdamer.solveEquations(clean);
      return {
        answer: `x = ${solved.join(", ")}`,
        explanation: "Solved equation"
      };
    }

    // EXPAND
    const expanded = nerdamer(clean).expand().toString();
    if (expanded !== clean) {
      return {
        answer: expanded,
        explanation: "Expanded expression"
      };
    }

    // FACTOR
    const factored = nerdamer.factor(clean).toString();
    if (factored !== clean) {
      return {
        answer: factored,
        explanation: "Factored expression"
      };
    }

    // ROOTS
    if (clean.includes("x")) {
      const roots = nerdamer.solveEquations(clean + "=0");
      if (roots?.length) {
        return {
          answer: `Roots: ${roots.join(", ")}`,
          explanation: "Solved algebraically"
        };
      }
    }

    // BASIC CALC
    const result = math.evaluate(clean);

    return {
      answer: result.toString(),
      explanation: "Calculated"
    };

  } catch (err) {
    console.log("MATH ERROR:", err);
    return {
      answer: "❌ Math error",
      explanation: "Could not solve"
    };
  }
}

// ===== PHOTO ANALYSIS =====
async function analyzeImage(url) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Solve or describe this image." },
              { type: "image_url", image_url: { url } }
            ]
          }
        ]
      })
    });

    const json = await res.json();

    return json.choices?.[0]?.message?.content || "❌ No image result";

  } catch (err) {
    console.log("IMAGE ERROR:", err);
    return "❌ Image analysis failed";
  }
}

// ===== QUIZ =====
function quiz(topic) {
  return {
    answer: `📚 Quiz: ${topic}`,
    explanation: `Explain ${topic}`
  };
}

// ===== FLASHCARDS =====
function flashcards(topic) {
  return {
    answer: `🧾 Flashcards: ${topic}`,
    explanation: `Q: What is ${topic}?\nA: (Think)`
  };
}

// ===== TIMER =====
const timers = new Map();

function startTimer(userId, mins) {
  timers.set(userId, Date.now() + mins * 60000);
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
            content: `Answer STRICTLY:

Answer: <answer>

Explanation:
<explanation>`
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await res.json();

    return data.choices?.[0]?.message?.content || "No response";

  } catch {
    return "❌ AI error";
  }
}

// ===== ENGINE =====
async function engine(input, user, attachmentUrl) {

  // 📷 IMAGE FIRST
  if (attachmentUrl) {
    const img = await analyzeImage(attachmentUrl);
    return {
      answer: img,
      explanation: "Image analyzed"
    };
  }

  // 🧠 MATH
  if (isMath(input)) {
    return solveMath(input);
  }

  // 📚 QUIZ
  if (input.startsWith("quiz ")) {
    return quiz(input.replace("quiz ", ""));
  }

  // 🧾 FLASHCARDS
  if (input.startsWith("flashcards ")) {
    return flashcards(input.replace("flashcards ", ""));
  }

  // ⏱️ TIMER
  if (input.startsWith("timer ")) {
    const mins = parseInt(input.replace("timer ", ""));
    return {
      answer: startTimer(user.id, mins),
      explanation: "Timer started"
    };
  }

  // 🤖 AI
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
    .addStringOption(opt =>
      opt.setName("question").setDescription("Your question").setRequired(true)
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

    // attachment (image)
    const attachment = interaction.options.getAttachment?.("image");
    const imageUrl = attachment?.url;

    await interaction.deferReply();

    const result = await engine(question, { ...user, id: interaction.user.id }, imageUrl);

    user.xp += 10;
    levelUp(user);
    save();

    await interaction.editReply(
      `🧠 Answer:\n${result.answer}\n\n📖 Explanation:\n${result.explanation}`
    );
  }
});

client.login(TOKEN);