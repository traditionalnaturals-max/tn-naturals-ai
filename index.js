require("dotenv").config();

const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");
const conversations = new Map();
const app = express();
app.use(express.json());

// =============================
// Load Knowledge Base
// =============================
const knowledgeBase =
  fs.readFileSync("knowledge-base.md", "utf8") +
  "\n\n" +
  fs.readFileSync("knowledge_base_faq.md", "utf8");

// =============================
// FAQ Search Engine
// =============================

const faqData = fs.readFileSync("knowledge_base_faq.md", "utf8");

function normalize(text) {

    return text
        .toLowerCase()

        // Remove Bengali punctuation
        .replace(/[।,!?;:"'()\-]/g, " ")

        // Remove English punctuation
        .replace(/[^\u0980-\u09FFa-z0-9 ]/gi, " ")

        // Remove extra spaces
        .replace(/\s+/g, " ")

        .trim();

}
function similarity(question, faqQuestion) {

    const q1 = normalize(question).split(" ");
    const q2 = normalize(faqQuestion).split(" ");

    let matched = 0;

    for (const word of q1) {
        if (q2.includes(word)) {
            matched++;
        }
    }

    return matched / Math.max(q1.length, q2.length);

}
function searchFAQ(question) {

  const userQuestion = normalize(question);

  const blocks = faqData.split("--------------------------------------------------");

  for (const block of blocks) {

    const q = block.match(/### Question([\s\S]*?)### Answer/i);

    const a = block.match(/### Answer([\s\S]*)/i);

    if (!q || !a) continue;

    const faqQuestion = normalize(q[1]);
const score = similarity(userQuestion, faqQuestion);
      if (score >= 0.75) {
    return a[1].trim();
}
   // Exact Match
if (faqQuestion === userQuestion) {
    return a[1].trim();
}

// FAQ contains user question
if (faqQuestion.includes(userQuestion)) {
    return a[1].trim();
}

// User question contains FAQ
if (userQuestion.includes(faqQuestion)) {
    return a[1].trim();
}

// Word Match
const faqWords = faqQuestion.split(" ");
const userWords = userQuestion.split(" ");

let matched = 0;

for (const word of userWords) {
    if (faqWords.includes(word)) {
        matched++;
    }
}

if (matched >= Math.max(2, Math.floor(userWords.length * 0.7))) {
    return a[1].trim();
}

  }

  return null;

}

const badWords = [
  "শালা",
  "মাগী",
  "মাদারচোদ",
  "বাঞ্চোদ",
  "চোদ",
  "চুদি",
  "বাল",
  "খানকির",
  "fuck",
  "fucking",
  "bastard",
  "mc",
  "bc",
  "bal",
 "Bl",
"Sona",
"Bara",
"ভাড়া",
"Hda",
"Hedarput",
"তর",
"সুয়োর",
"Suyor",
"Sala",
  "bokachoda"
];

// =============================
// OpenAI
// =============================

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =============================
// Environment Variables
// =============================
const VERIFY_TOKEN = "tnnaturals123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// =============================
// Home
// =============================
app.get("/", (req, res) => {
  res.send("TN Naturals AI Bot Running Successfully");
});

// =============================
// Webhook Verification
// =============================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook Verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// =============================
// Receive WhatsApp Messages
// =============================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (
      body.object &&
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages
    ) {
      const message = body.entry[0].changes[0].value.messages[0];

      const from = message.from;

      if (!conversations.has(from)) {
  conversations.set(from, []);
}

const history = conversations.get(from);
      // Text Message
      let userMessage = "";

      if (message.type === "text") {
        userMessage = message.text.body;
      } else {
        userMessage = "";
      }

      console.log("📩 User:", userMessage);

      // Ignore empty messages
      if (!userMessage.trim()) {
        return res.sendStatus(200);
      }

      // =============================
      // Ask OpenAI using Knowledge Base
      // =============================

        // =============================
// FAQ Search First
// =============================

// ===========================
// Bad Word Filter
// ===========================

const isBadWord = badWords.some(word =>
  userMessage.toLowerCase().includes(word.toLowerCase())
);

if (isBadWord) {

  await axios.post(
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "text",
      text: {
        body: "এইখানে গালি বা অশালীন ভাষা ব্যবহার করবেন না। এতে পরে আপনার সমস্যাও হতে পারে। অনুগ্রহ করে ভদ্র ভাষায় আপনার সমস্যাটি জানান।"
      }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  return res.sendStatus(200);
}
      
const faqReply = searchFAQ(userMessage);
console.log("FAQ Result:", faqReply);
if (faqReply) {

  await axios.post(
    `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: from,
      type: "text",
      text: {
        body: faqReply,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("✅ FAQ Reply Sent");

  return res.sendStatus(200);
}


        
// =============================
// OpenAI Fallback
// =============================
        
        const ai = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `
You are TN Naturals Customer Support Executive.

Use ONLY the information from the Knowledge Base below.

${knowledgeBase}

Rules:

1. If the customer's question exactly matches or clearly matches an FAQ, return the Answer EXACTLY as written.

2. Never rewrite, shorten, improve, explain or translate FAQ answers.

3. Never create any medical advice yourself.

4. If the answer is NOT available inside the Knowledge Base, DO NOT guess.

5. If the answer is NOT available inside the Knowledge Base or FAQ, reply exactly:

"এই বিষয়ে বিস্তারিত জানতে অনুগ্রহ করে 9862900335 নম্বরে কল করুন। ধন্যবাদ।"

6. Never use these words:
- AI
- ChatGPT
- Knowledge Base
- Language Model

7. Always behave like a real TN Naturals Customer Support Executive.

8. Greet ("নমস্কার") only if the customer's first message is a greeting like: নমস্কার, হ্যালো, Hi, Hello, Hey.

9. If the customer directly asks a question, do NOT start the reply with "নমস্কার". Answer the question directly.

10. Never repeat "নমস্কার" multiple times in the same conversation. 

               `
          },
          ...history,
          {
            role: "user",
            content: userMessage
          }
        ]
      });

      const reply = ai.choices[0].message.content.trim();
history.push(
  {
    role: "user",
    content: userMessage
  },
  {
    role: "assistant",
    content: reply
  }
);

if (history.length > 10) {
  history.splice(0, history.length - 10);
}
      
      console.log("🤖 Reply:", reply);

      // =============================
      // Send WhatsApp Reply
      // =============================
      await axios.post(
        `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: {
            body: reply,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ Reply Sent Successfully");
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("❌ ERROR:");
    console.error(err.response?.data || err.message);

    res.sendStatus(500);
  }
});

// =============================
// Start Server
// =============================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 TN Naturals AI Server running on port ${PORT}`);
});

