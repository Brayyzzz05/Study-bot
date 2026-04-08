import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const BACKEND = process.env.BACKEND_URL;

// Store active quizzes per user
const activeQuiz = new Map();

// =====================
// READY
// =====================
client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =====================
// MESSAGE HANDLER
// =====================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.trim().split(" ");
  const cmd = args.shift()?.toLowerCase();

  // =====================
  // 🧠 ASK (AI)
  // =====================
  if (cmd === "/ask") {
    const question = args.join(" ");

    if (!question) {
      return message.reply("❌ Please ask a question.");
    }

    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: question })
      });

      const data = await res.json();

      if (!data || !data.reply) {
        return message.reply("❌ No response from AI.");
      }

      message.reply(data.reply.slice(0, 1900));

    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to contact backend.");
    }
  }

  // =====================
  // 📚 FLASHCARDS
  // =====================
  if (cmd === "/flashcard") {
    const sub = args.shift();

    // ADD FLASHCARD
    if (sub === "add") {
      const input = args.join(" ");
      const [question, answer] = input.split("|");

      if (!question || !answer) {
        return message.reply("❌ Use: /flashcard add question|answer");
      }

      try {
        await fetch(`${BACKEND}/flashcard/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: message.author.id,
            question: question.trim(),
            answer: answer.trim()
          })
        });

        message.reply("✅ Flashcard saved");

      } catch {
        message.reply("❌ Failed to save flashcard");
      }
    }

    // QUIZ FROM FLASHCARDS
    if (sub === "quiz") {
      try {
        const res = await fetch(`${BACKEND}/flashcard/random`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: message.author.id })
        });

        const data = await res.json();

        if (!data.question) {
          return message.reply("❌ No flashcards found.");
        }

        activeQuiz.set(message.author.id, data.answer);

        message.reply(`❓ ${data.question}`);

      } catch {
        message.reply("❌ Quiz error");
      }
    }

    // ANSWER QUIZ
    if (sub === "answer") {
      const answer = args.join(" ");
      const correct = activeQuiz.get(message.author.id);

      if (!correct) {
        return message.reply("❌ No active quiz.");
      }

      try {
        const res = await fetch(`${BACKEND}/quiz/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ correct, answer })
        });

        const data = await res.json();

        message.reply(data.reply);

        activeQuiz.delete(message.author.id);

      } catch {
        message.reply("❌ Failed to check answer");
      }
    }
  }

  // =====================
  // 🧪 QUICK QUIZ (AI GENERATED)
  // =====================
  if (cmd === "/quiz") {
    const topic = args.join(" ");

    if (!topic) {
      return message.reply("❌ Provide a topic. Example: /quiz algebra");
    }

    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Create 1 short quiz question with answer on: ${topic}`
        })
      });

      const data = await res.json();

      message.reply(data.reply);

    } catch {
      message.reply("❌ Failed to generate quiz");
    }
  }

  // =====================
  // ⏱ TIMER
  // =====================
  if (cmd === "/timer") {
    const mins = parseInt(args[0]);

    if (isNaN(mins)) {
      return message.reply("❌ Use: /timer 5");
    }

    message.reply(`⏱ Timer started: ${mins} minutes`);

    setTimeout(() => {
      message.reply("⏰ Time's up!");
    }, mins * 60000);
  }

  // =====================
  // 🔄 RESET
  // =====================
  if (cmd === "/reset") {
    activeQuiz.delete(message.author.id);
    message.reply("🔄 Session reset");
  }
});

// =====================
// LOGIN
// =====================
client.login(process.env.DISCORD_TOKEN);