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
// Endpoint to suggest a random exercise item (preposition, adverb, adjective, phrasal verb)
app.get('/api/exercise', async (req, res, next) => {
  try {
    const type = req.query.type;
    // Tenses exercise: random source → target tense conversion sentences
    if (type === 'tenses') {
      const allTenses = ['present simple', 'past simple', 'present continuous', 'past continuous', 'future simple', 'future continuous'];
      const source = allTenses[Math.floor(Math.random() * allTenses.length)];
      const targets = allTenses.filter(t => t !== source);
      const target = targets[Math.floor(Math.random() * targets.length)];
      // Generate a single short sentence in the source tense
      const tenseResp = await retryRequest(() =>
        openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: `You are a helpful English teacher. Provide a single short sentence in the ${source} tense. Respond with only the sentence, no quotes or extra text.` }
          ],
          temperature: 1.0,
          max_tokens: 30,
        })
      );
      let suggestion = tenseResp.choices[0].message.content.trim();
      suggestion = suggestion.replace(/^['"]+|['"]+$/g, '');
      return res.json({ suggestion, source, target });
    }
    // Default word-based exercises
    const labelMap = { preposition: 'preposition', adverb: 'adverb', adjective: 'adjective', phrasal: 'phrasal verb' };
    const label = labelMap[type] || type;
    const exerciseResp = await retryRequest(() =>
      openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: `You are a helpful English teacher. Provide a single random English ${label} (no quotes or extra text).` }
        ],
        temperature: 1.0,
        max_tokens: 5,
      })
    );
    let suggestion = exerciseResp.choices[0].message.content.trim();
    suggestion = suggestion.replace(/^['"]+|['"]+$/g, '');
    res.json({ suggestion });
  } catch (err) {
    next(err);
  }
});

// Endpoint to suggest a random preposition
app.get('/api/preposition', async (req, res, next) => {
  try {
    const prepositionResp = await retryRequest(() =>
      openai.chat.completions.create({
        model: 'gpt-3.5-turbo',  // faster model for preposition suggestions
        messages: [
          { role: 'system', content: 'You are a helpful English teacher. Provide a single random English preposition (e.g., under, above, between) without quotes or extra text.' }
        ],
        temperature: 1.0,
        max_tokens: 3,
      })
    );
    let prep = prepositionResp.choices[0].message.content.trim();
    // strip surrounding quotes if any
    prep = prep.replace(/^['"]+|['"]+$/g, '');
    res.json({ preposition: prep });
  } catch (err) {
    next(err);
  }
});

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
    // Speech-to-text with retry on rate limits; use GPT-4o transcription model
    const transcription = await retryRequest(() =>
      openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: 'gpt-4o-transcribe',
      })
    );
    const userText = transcription.text.trim();

    // Dynamic exercise-specific correction or conversion
    const suggestion = req.body.suggestion;
    const type = req.body.type;
    let systemPrompt;
    if (type === 'tenses') {
      // Tenses exercise: present simple to past simple conversion
      systemPrompt = 'You are a native American English speaker named Ellie. You are young, cheerful, helpful, and kind. Begin with a friendly greeting (e.g., "Hey there!"), and maintain a natural conversational tone. ' +
        `The exercise is to convert the following present simple sentence to past simple tense: "${suggestion}". ` +
        'Please check if the user\'s response is a correct conversion; if incorrect, provide the correct past simple sentence. ' +
        'Provide feedback and examples as a friend.';
    } else {
      // Default word-based grammar correction
      const labelMap = { preposition: 'preposition', adverb: 'adverb', adjective: 'adjective', phrasal: 'phrasal verb' };
      const label = labelMap[type] || type;
      systemPrompt = 'You are a native American English speaker named Ellie. You are young, cheerful, helpful, and kind. Begin with a friendly greeting (e.g., "Hey there!"), and maintain a natural conversational tone. ' +
        'You are here to converse with a non-native speaker and help correct any grammatical error and teach correct usage as a friend.';
      if (suggestion) {
        systemPrompt += ` The current exercise is to use the ${label} "${suggestion}". ` +
          `Please correct the user's sentence, comment on whether they used the ${label} correctly, and provide feedback and examples as a friend.`;
      }
    }
    // Instruct model to append usage correctness marker
    systemPrompt += ' After providing feedback and examples, append two newline characters then "USAGE_CORRECT: yes" or "USAGE_CORRECT: no" indicating if the exercise usage was correct.';
    const chatCompletion = await retryRequest(() =>
      openai.chat.completions.create({
        model: 'gpt-3.5-turbo',  // faster model for grammar correction
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
        temperature: 0.2,
      })
    );
    // Parse GPT response and extract usage correctness flag
    const fullResponse = chatCompletion.choices[0].message.content.trim();
    const parts = fullResponse.split(/\n\n?USAGE_CORRECT:/i);
    const corrected = parts[0].trim();
    let usageCorrect = false;
    if (parts[1]) {
      usageCorrect = parts[1].trim().toLowerCase().startsWith('yes');
    }

    // Cleanup temporary file
    fs.unlink(audioPath, () => {});
    // Generate TTS audio using GPT-4o Mini TTS and convert to base64
    const ttsResp = await retryRequest(() =>
      openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: 'sage',
        instructions: `Affect/personality: A cheerful guide Tone: Friendly, clear, and reassuring, creating a calm atmosphere and making the listener feel confident and comfortable. Pronunciation: Clear, articulate, and steady, ensuring each instruction is easily understood while maintaining a natural, conversational flow. Pause: Brief, purposeful pauses after key instructions (e.g., "cross the street" and "turn right") to allow time for the listener to process the information and follow along. Emotion: Warm and supportive, conveying empathy and care, ensuring the listener feels guided and safe throughout the journey.`,
        input: corrected,
        response_format: 'wav',
      })
    );
    const ttsArray = await ttsResp.arrayBuffer();
    const ttsBuffer = Buffer.from(ttsArray);
    const base64Audio = ttsBuffer.toString('base64');
    // Return original, corrected, audio and usage flag
    res.json({ original: userText, corrected, audio: base64Audio, mime: 'audio/wav', usageCorrect });
  } catch (error) {
    next(error);
  }
});

// Endpoint for streaming TTS audio response: transcribe, correct, and stream TTS
// Endpoint for streaming TTS audio response: transcribe, correct, and return audio for playback
app.post('/api/process-stream', upload.single('audio'), async (req, res, next) => {
  try {
    // Ensure uploaded file has an extension for transcription
    let audioPath = req.file.path;
    const originalName = req.file.originalname || '';
    const ext = path.extname(originalName);
    if (ext) {
      try { fs.renameSync(audioPath, audioPath + ext); audioPath += ext; } catch {};
    }
    // Speech-to-text
    const transcription = await retryRequest(() =>
      openai.audio.transcriptions.create({ file: fs.createReadStream(audioPath), model: 'gpt-4o-transcribe' })
    );
    const userText = transcription.text.trim();
    // Build system prompt
    const suggestion = req.body.suggestion;
    const type = req.body.type;
    let systemPrompt = '';
    if (type === 'tenses') {
      systemPrompt = 'You are a native American English speaker named Ellie. You are young, cheerful, helpful, and kind. Begin with a friendly greeting (e.g., "Hey there!"), and maintain a natural conversational tone. ' +
        `The exercise is to convert the following present simple sentence to past simple tense: "${suggestion}". ` +
        'Please check if the user\'s response is a correct conversion; if incorrect, provide the correct past simple sentence. ' +
        'Provide feedback and examples as a friend.';
    } else {
      systemPrompt = 'You are a native American English speaker named Ellie. You are young, cheerful, helpful, and kind. Begin with a friendly greeting (e.g., "Hey there!"), and maintain a natural conversational tone. ' +
        'You are here to converse with a non-native speaker and help correct any grammatical error and teach correct usage as a friend.';
      if (suggestion) {
        const labelMap = { preposition: 'preposition', adverb: 'adverb', adjective: 'adjective', phrasal: 'phrasal verb' };
        const label = labelMap[type] || type;
        systemPrompt += ` The current exercise is to use the ${label} "${suggestion}". ` +
          `Please correct the user's sentence, comment on whether they used the ${label} correctly, and provide feedback and examples as a friend.`;
      }
    }
    systemPrompt += ' After providing feedback and examples, append two newline characters then "USAGE_CORRECT: yes" or "USAGE_CORRECT: no" indicating if the exercise usage was correct.';
    // Grammar correction
    const chatResp = await retryRequest(() =>
      openai.chat.completions.create({ model: 'gpt-3.5-turbo', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }], temperature: 0.2 })
    );
    const fullResponse = chatResp.choices[0].message.content.trim();
    const parts = fullResponse.split(/\n\n?USAGE_CORRECT:/i);
    const corrected = parts[0].trim();
    // Cleanup
    fs.unlink(audioPath, () => {});
    // Generate TTS audio
    const ttsResp = await retryRequest(() =>
      openai.audio.speech.create({
        model: 'gpt-4o-mini-tts', voice: 'sage',
        instructions: `Affect/personality: A cheerful guide Tone: Friendly, clear, and reassuring, creating a calm atmosphere and making the listener feel confident and comfortable. Pronunciation: Clear, articulate, and steady, ensuring each instruction is easily understood while maintaining a natural, conversational flow. Pause: Brief, purposeful pauses after key instructions (e.g., "cross the street" and "turn right") to allow time for the listener to process the information and follow along. Emotion: Warm and supportive, conveying empathy and care, ensuring the listener feels guided and safe throughout the journey.`,
        input: corrected, response_format: 'wav'
      })
    );
    // Return binary audio for MSE playback
    const arrayBuffer = await ttsResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.setHeader('Content-Type', 'audio/wav');
    res.send(buffer);
  } catch (err) {
    next(err);
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