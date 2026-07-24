require("dotenv").config();

const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const fs = require("fs");
const FormData = require("form-data");
const mongoose = require("mongoose");
const { google } = require("googleapis");
const path = require("path");
const conversations = new Map();
const processedMessages = new Set();
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
  version: "v4",
  auth,
});
const conversationSchema = new mongoose.Schema({
  phone: {
    type: String,
    unique: true
  },
  fullName: String,
gender: String,
age: String,
language: String,
state: String,
district: String,
city: String,
address: String,
landmark: String,
pincode: String,
product: String,
orderConfirmed: {
  type: Boolean,
  default: false
},
  history: [
    {
      role: String,
      content: String
    }
  ],
  updatedAt: {
  type: Date,
  default: Date.now
}
});

const Conversation = mongoose.model("Conversation", conversationSchema);

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
      if (processedMessages.has(message.id)) {
    return res.sendStatus(200);
}

processedMessages.add(message.id);

setTimeout(() => {
    processedMessages.delete(message.id);
}, 600000);
      console.log("Message ID:", message.id);

      const from = message.from;

     let conversation = await Conversation.findOne({ phone: from });
      console.log("Phone:", from);
console.log("DB Phone:", conversation?.phone);

if (!conversation) {
    conversation = await Conversation.create({
        phone: from,
        history: [],
      fullName: "",
gender: "",
age: "",
language: "",
state: "",
district: "",
city: "",
address: "",
landmark: "",
pincode: "",
product: "",
orderConfirmed: false,
updatedAt: new Date()
    });
}

const history = conversation.history;
 console.log("History Length:", history.length);
      // Text Message
     let userMessage = "";

if (message.type === "text") {
    userMessage = message.text.body;
}

else if (message.type === "audio") {

    const mediaId = message.audio.id;

    const media = await axios.get(
        `https://graph.facebook.com/v25.0/${mediaId}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
            }
        }
    );

    console.log("Voice URL:", media.data.url);
const audio = await axios.get(media.data.url, {
  responseType: "arraybuffer",
  headers: {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
  }
});

fs.writeFileSync("voice.ogg", audio.data);

const form = new FormData();
form.append("file", fs.createReadStream("voice.ogg"));
form.append("model", "gpt-4o-mini-transcribe");

const transcript = await axios.post(
  "https://api.openai.com/v1/audio/transcriptions",
  form,
  {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...form.getHeaders()
    }
  }
);

userMessage = transcript.data.text;

console.log("Voice Text:", userMessage);
}

else {
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

11. Detect the customer's language automatically before replying.

12. Reply in the same language the customer uses.

13. Bengali → Reply in Bengali.

14. Banglish → Reply in Banglish.

15. Hindi → Reply in Hindi.

16. Roman Hindi / Hinglish → Reply in Roman Hindi.

17. English → Reply in English.

18. If the customer changes language, immediately switch to that language.

19. Never translate unless the customer requests it.

20. Besides replying to the customer, silently extract customer information.

21. Return ONLY valid JSON.

22. Format:

{
  "reply": "",
  "customer": {
    "fullName": "",
    "age": "",
    "gender": "",
    "language": "",
    "state": "",
    "district": "",
    "city": "",
    "address": "",
    "landmark": "",
    "pincode": "",
    "product": "",
    "orderConfirmed": false
  }
}

23. Unknown fields must remain "".

24. Never invent customer information.

25. Keep previously known information unchanged unless the customer provides new information.

26. "reply" contains the normal customer reply.

27. "customer" contains only extracted data.

               `
          },
          ...history,
          {
            role: "user",
            content: userMessage
          }
        ]
      });
      
const fullName = conversation.fullName;
const age = conversation.age;
const gender = conversation.gender;
const language = conversation.language;
const state = conversation.state;
const district = conversation.district;
const city = conversation.city;
const address = conversation.address;
const landmark = conversation.landmark;
const pincode = conversation.pincode;
const product = conversation.product;
      
let aiResult;

try {
  aiResult = JSON.parse(ai.choices[0].message.content);
} catch (err) {
  console.error("Invalid AI JSON:", err);
  aiResult = {
    reply: ai.choices[0].message.content.trim(),
    customer: {}
  };
}
console.log("===== AI RESULT =====");
console.log(JSON.stringify(aiResult, null, 2));
const reply = aiResult.reply || "";
const customer = aiResult.customer || {};
      if (customer.fullName) conversation.fullName = customer.fullName;
if (customer.age) conversation.age = customer.age;
if (customer.gender) conversation.gender = customer.gender;
if (customer.language) conversation.language = customer.language;
if (customer.state) conversation.state = customer.state;
if (customer.district) conversation.district = customer.district;
if (customer.city) conversation.city = customer.city;
if (customer.address) conversation.address = customer.address;
if (customer.landmark) conversation.landmark = customer.landmark;
if (customer.pincode) conversation.pincode = customer.pincode;
if (customer.product) conversation.product = customer.product;

if (customer.orderConfirmed === true) {
  conversation.orderConfirmed = true;
}
      // Save customer data to Google Sheet

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

if (history.length > 50) {
  history.splice(0, history.length - 50);
}

conversation.history = history;
console.log(JSON.stringify(history, null, 2));     
await conversation.save();
      if (conversation.orderConfirmed) {
  await saveOrderToSheet([
    "",
    conversation.fullName,
    from,
    from,
    conversation.gender,
    conversation.age,
    conversation.language,
    conversation.state,
    conversation.district,
    conversation.city,
    conversation.address,
    conversation.landmark,
    conversation.pincode,
    "",
    "",
    "",
    conversation.product,
    new Date().toLocaleDateString("en-IN"),
    "WhatsApp AI",
    "Confirmed Order",
    "WhatsApp",
    new Date().toLocaleDateString("en-IN"),
    ""
  ]);
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
    async function saveOrderToSheet(rowData) {
  try {
    const rows = await sheets.spreadsheets.values.get({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: "CUSTOMER MASTER!A:Z",
});

const values = rows.data.values || [];
const existingRow = values.findIndex(
  row => row[2] === rowData[2]
);

if (existingRow !== -1) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `CUSTOMER MASTER!A${existingRow + 2}:Z${existingRow + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [rowData],
    },
  });

  console.log("✅ Existing Customer Updated");
  return;
}
await sheets.spreadsheets.values.append({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: "CUSTOMER MASTER!A:Z",
  valueInputOption: "USER_ENTERED",
  requestBody: {
    values: [rowData],
  },
});
  console.log(rowData);
    console.log("✅ Order Saved To Google Sheet");
  } catch (err) {
    console.error("❌ Google Sheet Save Error:", err.message);
  }
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

