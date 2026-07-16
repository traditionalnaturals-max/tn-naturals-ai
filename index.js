require("dotenv").config();

const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const fs = require("fs");

const app = express();

app.use(express.json());

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// =========================
// Load Knowledge
// =========================

const knowledgeBase =
    fs.readFileSync("./knowledge-base.md", "utf8") +
    "\n\n" +
    fs.readFileSync("./knowledge_base_faq.md", "utf8");

// =========================
// ENV
// =========================

const VERIFY_TOKEN = "tnnaturals123";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// =========================
// Customer Memory
// =========================

const memory = new Map();

function getHistory(phone){

    if(!memory.has(phone)){

        memory.set(phone,[]);

    }

    return memory.get(phone);

}

function saveHistory(phone,role,content){

    const history=getHistory(phone);

    history.push({

        role,

        content

    });

    if(history.length>20){

        history.shift();

    }

}

// =========================
// Search Knowledge
// =========================

function normalize(text){

    return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu," ")
    .replace(/\s+/g," ")
    .trim();

}

function searchKnowledge(question) {

    const query = normalize(question);

    const faqBlocks = knowledgeBase.split("## FAQ");

    let bestAnswer = null;
    let bestScore = 0;

    for (const block of faqBlocks) {

        const qMatch = block.match(/### Question\s*([\s\S]*?)### Answer/i);
        const aMatch = block.match(/### Answer\s*([\s\S]*)/i);

        if (!qMatch || !aMatch) continue;

        const faqQuestion = normalize(qMatch[1]);
        const faqAnswer = aMatch[1].trim();

        let score = 0;

        const words = query.split(" ");

        for (const word of words) {

            if (word.length < 2) continue;

            if (faqQuestion.includes(word)) {
                score++;
            }

        }

        if (score > bestScore) {

            bestScore = score;
            bestAnswer = faqAnswer;

        }

    }

    return bestAnswer;

}
// =========================
// AI System Prompt
// =========================

const SYSTEM_PROMPT = `
You are a TN Naturals Support Executive.

Rules:

1. Never say you are AI.
2. Never mention OpenAI.
3. Never mention GPT.
4. Never mention Knowledge Base.
5. Use ONLY the provided knowledge.
6. Never guess product information.
7. Never create medical advice.
8. Speak naturally.
9. Reply in the customer's language.
10. Keep replies short and professional.

If the answer is not available, reply ONLY:

"আপনার প্রশ্নটি নোট করা হয়েছে। সঠিক তথ্য নিশ্চিত করে আপনাকে জানানো হবে।"
`;

// =========================
// Build Messages
// =========================

function buildMessages(phone, userMessage) {

    const history = getHistory(phone);

    const matchedKnowledge = searchKnowledge(userMessage);

    let system = SYSTEM_PROMPT;

    if (matchedKnowledge) {

        system += `

Relevant Knowledge:

${matchedKnowledge}

Answer ONLY using the above knowledge.
Never use outside knowledge.
`;

    }

    return [

        {
            role: "system",
            content: system,
        },

        ...history,

        {
            role: "user",
            content: userMessage,
        }

    ];

}

// =========================
// Generate Reply
// =========================

async function generateReply(phone, userMessage) {

    // প্রথমে FAQ থেকে উত্তর খুঁজবে
    const faqAnswer = searchKnowledge(userMessage);

    // FAQ-তে উত্তর থাকলে সেটাই সরাসরি পাঠাবে
    if (faqAnswer) {

        saveHistory(phone, "user", userMessage);
        saveHistory(phone, "assistant", faqAnswer);

        return faqAnswer;

    }

    // FAQ-তে উত্তর না থাকলে GPT ব্যবহার করবে
    const messages = buildMessages(phone, userMessage);

    const response = await client.chat.completions.create({

        model: "gpt-4.1-mini",

        temperature: 0.1,

        max_tokens: 350,

        messages

    });

    const reply = response.choices[0].message.content.trim();

    saveHistory(phone, "user", userMessage);
    saveHistory(phone, "assistant", reply);

    return reply;

}
// =========================
// Home Route
// =========================

app.get("/", (req, res) => {

    res.send("TN Naturals AI Server Running");

});

// =========================
// Webhook Verification
// =========================

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

// =========================
// WhatsApp Webhook
// =========================

app.post("/webhook", async (req, res) => {

    try {

        const body = req.body;

        if (

            body.object &&
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0].value.messages

        ) {

            const message =
            body.entry[0].changes[0].value.messages[0];

            const from = message.from;

            const userMessage =
            message.text?.body || "";

            console.log("Customer :", userMessage);

            const reply =
            await generateReply(from,userMessage);

            await axios.post(

                `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,

                {

                    messaging_product:"whatsapp",

                    to:from,

                    type:"text",

                    text:{

                        body:reply

                    }

                },

                {

                    headers:{

                        Authorization:`Bearer ${WHATSAPP_TOKEN}`,

                        "Content-Type":"application/json"

                    }

                }

            );

            console.log("Reply Sent");

        }

        res.sendStatus(200);

    }

    catch(err){

        console.error(err.response?.data || err.message);

        res.sendStatus(500);

    }

});

// =========================
// Start Server
// =========================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(`🚀 TN Naturals AI Running on Port ${PORT}`);

});

// =========================
// Global Error Handler
// =========================

process.on("unhandledRejection", (err) => {

    console.error("Unhandled Rejection:", err);

});

process.on("uncaughtException", (err) => {

    console.error("Uncaught Exception:", err);

});

