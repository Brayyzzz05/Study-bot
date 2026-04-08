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

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ===== CLIENT =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== UTIL =====
function isMath(input) {
  return /^[\dxyz\+\-\*\/\^\(\)=\s]+$/i.test(input);
}

// ===== QUADRATIC HANDLER =====
function solveQuadratic(input) {
  try {
    const clean = input.replace(/\s+/g, "");

    if (!clean.includes("x^2")) return null;

    const factored = nerdamer.factor(clean).toString();

    if (factored !== clean) {
      return {
        answer: factored,
        explanation: "Factored quadratic (perfect or general)"
      };
    }

    const roots = nerdamer.solveEquations(clean + "=0");

    if (roots && roots.length > 0) {
      return {
        answer: `x = ${roots.join(", ")}`,
        explanation: "Solved quadratic (not factorable)"
      };
    }

    return null;
  } catch (err) {
    console.log("Quadratic error:", err);
    return null;
  }
}

// ===== INVERSE PROPORTION =====
function solveInverseProportion(input) {
  try {
    // Detect forms like: y = k/x OR y ∝ 1/x
    if (input.includes("1/x") || input.includes("proportional") || input.includes("∝")) {

      // Basic interpretation
      return {
        answer: "y = k / x",
        explanation: "Inverse proportion detected (y ∝ 1/x)"
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ===== GENERAL MATH =====
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

    // CALC
    const result = math.evaluate(clean);

    return {
      answer: result.toString(),
      explanation: "Evaluated"
    };

  } catch (err) {
    console.log("Math error:", err);
    return null;
  }
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

    const json = await res.json();

    return json.choices?.[0]?.message?.content || "No response";

  } catch {
    return "❌ AI error";
  }
}

// ===== ENGINE =====
async function engine(input, user) {

  // 1. INVERSE PROPORTION
  const inv = solveInverseProportion(input);
  if (inv) return inv;

  // 2. QUADRATIC (PRIORITY)
  const quad = solveQuadratic(input);
  if (quad) return quad;

  // 3. MATH
  if (isMath(input)) {
    const mathRes = solveMath(input);
    if (mathRes) return mathRes;
  }

  // 4. AI
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
      opt.setName("question")
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
    const question = interaction.options.getString("question");

    await interaction.deferReply();

    const result = await engine(question, {});

    await interaction.editReply(
      `🧠 Answer:\n${result.answer}\n\n📖 Explanation:\n${result.explanation}`
    );
  }
});

client.login(TOKEN);