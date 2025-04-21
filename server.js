require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');

const upload = multer({ dest: 'uploads/' });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper for retrying rate-limited requests with exponential backoff
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retryRequest(fn, retries = 3, backoff = 1000) {
  try {
    return await fn();
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      console.warn(`Rate limit exceeded. Retrying in ${backoff}ms... (${retries} retries left)`);
      await delay(backoff);
      return retryRequest(fn, retries - 1, backoff * 2);
    }
    throw err;
  }
}

app.post('/api/process', upload.single('audio'), async (req, res, next) => {
  try {
    // Ensure uploaded file has an extension so Whisper can recognize its format
    let audioPath = req.file.path;
    const originalName = req.file.originalname || '';
    const ext = path.extname(originalName);
    if (ext) {
      const newPath = audioPath + ext;
      try {
        fs.renameSync(audioPath, newPath);
        audioPath = newPath;
      } catch (renameErr) {
        console.warn('Could not rename file to include extension, proceeding with original path:', renameErr);
      }
    }
    // Speech-to-text with retry on rate limits; recreate stream on each attempt
    const transcription = await retryRequest(() =>
      openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
      })
    );
    const userText = transcription.text.trim();

    // Grammar correction with retry on rate limits
    const chatCompletion = await retryRequest(() =>
      openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful English teacher. Correct grammar and style.' },
          { role: 'user', content: userText },
        ],
        temperature: 0.2,
      })
    );
    const corrected = chatCompletion.choices[0].message.content.trim();

    // Text-to-speech with retry on rate limits
    const ttsResponse = await retryRequest(() =>
      openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: corrected,
        format: 'wav',
      })
    );
    // Handle binary audio response (ArrayBuffer, Buffer, or fetch Response)
    let rawAudio;
    if (Buffer.isBuffer(ttsResponse)) {
      rawAudio = ttsResponse;
    } else if (typeof ttsResponse.arrayBuffer === 'function') {
      rawAudio = Buffer.from(await ttsResponse.arrayBuffer());
    } else if (ttsResponse.data) {
      rawAudio = Buffer.from(ttsResponse.data);
    } else {
      rawAudio = Buffer.from(ttsResponse);
    }
    const base64Audio = rawAudio.toString('base64');

    // Cleanup temporary file
    fs.unlink(audioPath, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });

    res.json({ original: userText, corrected, audio: base64Audio, mime: 'audio/wav' });
  } catch (error) {
    next(error);
  }
});

// Global error handler: handle rate limit explicitly
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.response?.status;
  if (status === 429) {
    return res.status(429).json({ error: 'Rate limit exceeded, please try again later.' });
  }
  res.status(500).json({ error: err.message });
});

// Start the server and handle listen errors (e.g., port in use)
const server = app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please free the port or set a different PORT environment variable.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});