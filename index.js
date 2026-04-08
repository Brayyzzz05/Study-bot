import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const BACKEND = process.env.BACKEND_URL;

let activeQuiz = new Map();

// =====================
// READY EVENT (FIXED WARNING)
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
  const cmd = args.shift().toLowerCase();

  // =====================
  // 🧠 ASK
  // =====================
  if (cmd === "/ask") {
    const text = args.join(" ");

    if (!text) return message.reply("❌ Ask a question");

    try {
      const res = await fetch(`${BACKEND}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      const data = await res.json();
      message.reply(data.reply);

    } catch (err) {
      message.reply("❌ Failed to contact backend");
    }
  }

  // =====================
  // 📸 IMAGE
  // =====================
  if (cmd === "/image") {
    const attachment = message.attachments.first();

    if (!attachment) {
      return message.reply("❌ Attach an image");
    }

    try {
      const res = await fetch(`${BACKEND}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: attachment.url })
      });

      const data = await res.json();
      message.reply(data.reply);

    } catch (err) {
      message.reply("❌ Image error");
    }
  }

  // =====================
  // 📚 FLASHCARDS
  // =====================
  if (cmd === "/flashcard") {
    const sub = args.shift();

    // ADD
    if (sub === "add") {
      const [q, a] = args.join(" ").split("|");

      if (!q || !a) {
        return message.reply("❌ Format: /flashcard add question|answer");
      }

      await fetch(`${BACKEND}/flashcard/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: message.author.id,
          question: q,
          answer: a
        })
      });

      return message.reply("✅ Saved");
    }

    // QUIZ
    if (sub === "quiz") {
      const res = await fetch(`${BACKEND}/flashcard/random`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: message.author.id })
      });

      const data = await res.json();

      if (!data.question) {
        return message.reply("❌ No flashcards");
      }

      activeQuiz.set(message.author.id, data.answer);
      message.reply(`❓ ${data.question}`);
    }

    // ANSWER
    if (sub === "answer") {
      const correct = activeQuiz.get(message.author.id);
      const answer = args.join(" ");

      if (!correct) {
        return message.reply("❌ No active quiz");
      }

      const res = await fetch(`${BACKEND}/quiz/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correct, answer })
      });

      const data = await res.json();

      activeQuiz.delete(message.author.id);
      message.reply(data.reply);
    }
  }

  // =====================
  // ⏱ TIMER
  // =====================
  if (cmd === "/timer") {
    const mins = parseInt(args[0]);

    if (isNaN(mins)) {
      return message.reply("❌ Use /timer 5");
    }

    message.reply(`⏱ Timer: ${mins} minutes`);

    setTimeout(() => {
      message.reply("⏰ Time’s up!");
    }, mins * 60000);
  }

  // =====================
  // 🔄 RESET
  // =====================
  if (cmd === "/reset") {
    activeQuiz.delete(message.author.id);
    message.reply("🔄 Reset done");
  }
});

client.login(process.env.DISCORD_TOKEN);