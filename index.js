import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import fetch from "node-fetch";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const BACKEND_URL = process.env.BACKEND_URL;

// Simple in-memory storage
const flashcards = new Map();
const quizzes = new Map();
const timers = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const args = message.content.split(" ");
  const command = args.shift().toLowerCase();

  // =====================
  // 🧠 ASK (TEXT AI)
  // =====================
  if (command === "/ask") {
    const question = args.join(" ");

    if (!question && message.attachments.size === 0) {
      return message.reply("❌ Provide a question or image");
    }

    try {
      let body = { message: question };

      // IMAGE SUPPORT
      if (message.attachments.size > 0) {
        const image = message.attachments.first().url;
        body.image = image;
      }

      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!data.reply) {
        return message.reply("❌ No AI response");
      }

      message.reply(data.reply);

    } catch (err) {
      console.error(err);
      message.reply("❌ AI error");
    }
  }

  // =====================
  // 🧠 FLASHCARDS
  // =====================
  if (command === "/flashcard") {
    const [sub, ...rest] = args;

    if (sub === "add") {
      const [front, back] = rest.join(" ").split("|");
      if (!front || !back) {
        return message.reply("❌ Use: /flashcard add question|answer");
      }

      flashcards.set(front, back);
      message.reply("✅ Flashcard saved");
    }

    if (sub === "quiz") {
      const entries = Array.from(flashcards.entries());
      if (entries.length === 0) return message.reply("❌ No flashcards");

      const [question, answer] = entries[Math.floor(Math.random() * entries.length)];

      quizzes.set(message.author.id, answer);

      message.reply(`❓ ${question}`);
    }

    if (sub === "answer") {
      const correct = quizzes.get(message.author.id);
      const userAnswer = rest.join(" ");

      if (!correct) return message.reply("❌ No active quiz");

      if (userAnswer.toLowerCase() === correct.toLowerCase()) {
        message.reply("✅ Correct!");
      } else {
        message.reply(`❌ Wrong! Answer: ${correct}`);
      }

      quizzes.delete(message.author.id);
    }
  }

  // =====================
  // ⏱ TIMER
  // =====================
  if (command === "/timer") {
    const minutes = parseInt(args[0]);

    if (isNaN(minutes)) return message.reply("❌ Enter minutes");

    message.reply(`⏱ Timer started for ${minutes} minutes`);

    setTimeout(() => {
      message.reply(`⏰ Time's up!`);
    }, minutes * 60000);
  }

  // =====================
  // ➗ MATH ENGINE (LOCAL)
  // =====================
  if (command === "/math") {
    const expression = args.join(" ");

    try {
      // VERY basic safe eval
      if (!expression) return message.reply("❌ No expression");

      // Handle simple factorable forms manually
      if (expression.includes("x^2")) {
        return message.reply("🧠 Answer: Factorisation handled by AI backend");
      }

      const result = eval(expression.replace(/[^0-9+\-*/().]/g, ""));

      message.reply(`🧠 Answer: ${result}`);
    } catch {
      message.reply("❌ Invalid math");
    }
  }
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);