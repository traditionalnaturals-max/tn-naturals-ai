require("dotenv").config();

const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");

const fs = require("fs");
const knowledgeBase = fs.readFileSync("knowledge-base.md", "utf8") + "\n\n" + fs.readFileSync("knowledge_base_faq.md", "utf8");

const app = express();
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VERIFY_TOKEN = "tnnaturals123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Home
app.get("/", (req, res) => {
  res.send("TN Naturals AI Bot Running Successfully");
});

// Webhook Verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook Verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Receive WhatsApp Messages
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
      const userMessage = message.text?.body || "";

      console.log("User:", userMessage);
      console.log("PHONE_NUMBER_ID:", PHONE_NUMBER_ID);
      console.log(
        "TOKEN:",
        WHATSAPP_TOKEN ? WHATSAPP_TOKEN.substring(0, 20) : "NO TOKEN"
      );

      // AI Response
      const ai = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
  role: "system",
  content:
    "You are TN Naturals AI Assistant. Always answer ONLY using the following Knowledge Base.\n\n" + knowledgeBase,
},
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      const reply = ai.choices[0].message.content;

      // Send WhatsApp Reply
      const response = await axios.post(
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

      console.log("Reply Sent Successfully");
      console.log(response.data);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("ERROR:");
    console.error(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// Start Server
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 TN Naturals AI Server running on port ${PORT}`);
});
