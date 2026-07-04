const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("TN Naturals AI Bot is running!");
});

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "tnnaturals123";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
