 # Ellie – Your English Pal

 **Ellie** is a web application designed to help non-native English speakers practice grammar exercises interactively through a friendly chat interface. It offers five exercise categories:
 1. Tenses (convert present simple to past simple)
 2. Prepositions
 3. Adverbs
 4. Adjectives
 5. Phrasal Verbs

 ## Features
 - **Dynamic Exercises**: Each category provides either a word (e.g., a preposition) or a short sentence (for tenses) for the user to practice.
 - **Voice Interaction**: Users record their spoken responses via the browser’s microphone. Audio is sent to OpenAI Whisper for transcription.
 - **Grammar Correction & Feedback**: Transcribed text is corrected by OpenAI GPT-3.5‑Turbo, with explanations and correctness flags.
 - **Text‑to‑Speech**: Corrected responses are returned as cheerful audio (GPT-4o Mini TTS), played back in the browser.
 - **Scoring System**: Points, streaks, milestones, and a global bonus encourage sustained practice. Scores persist in `localStorage`.
 - **Responsive, Animated UI**: CSS animations for Ellie’s avatar and confetti celebrations keep the experience engaging.

 ## Project Structure
 ```text
 / (root)
 ├─ server.js           # Express server & OpenAI integrations
 ├─ package.json        # Dependencies & scripts
 ├─ .env                # OPENAI_API_KEY, PORT, etc.
 ├─ public/             # Static web assets
 │  ├─ index.html       # Main HTML layout
 │  ├─ style.css        # Styling and animations
 │  ├─ app.js           # Client-side logic (tabs, recording, scoring)
 │  └─ avatar.png       # Ellie’s avatar image
 ├─ uploads/            # Temporary audio uploads (cleanup after use)
 └─ README.md           # This documentation
 ```

 ## Installation & Setup
 1. **Clone the repository**:
    ```bash
    git clone https://github.com/sarduldabas/dev.git
    cd dev  # or the cloned repository directory
    ```
 2. **Install dependencies**:
    ```bash
    npm install
    ```
 3. **Configure environment**:
    Create a `.env` file in the root:
    ```dotenv
    OPENAI_API_KEY=your_api_key_here
    PORT=3000           # optional
    ```
 4. **Start the server**:
    ```bash
    npm start        # uses "node server.js"
    # or
    node server.js
    ```
 5. **Open in browser** at `http://localhost:3000` to begin practicing with Ellie.

 ## Server (server.js)
 - **Express static**: Serves all files under `/public`.
 - **GET /api/exercise?type=<type>**
   - If `type=tenses`, returns a short present simple sentence for conversion.
   - Otherwise, returns a single random word (preposition/adverb/adjective/phrasal verb) via GPT-3.5‑Turbo.
 - **POST /api/process**
   - Accepts multipart/form-data: the recorded audio file + `type` + `suggestion`.
   - **Whisper transcription** of uploaded audio.
   - **GPT correction** or **tense conversion**:
     - Tenses: checks student’s conversion, supplies correct form.
     - Others: corrects grammar around the exercise word, flags usage correctness.
   - **TTS**: generates a WAV audio response (GPT-4o Mini TTS).
   - Responds with JSON `{ original, corrected, audio: Base64, mime, usageCorrect }`.
 - **Retry logic**: `retryRequest()` wraps all OpenAI calls to handle 429 rate limits with exponential backoff.

 ## Client (public/app.js)
 1. **State & Elements**: Tracks `currentType`, `currentSuggestion`, and `stats` (in `localStorage`). Selects UI elements (tabs, buttons, display fields).
 2. **UI Update Functions**:
    - `updateScoreboard()`, `updateProgressBars()`, `updateStreak()`, `updateBackground()` apply scores, progress percentages, streak displays, and background gradients.
 3. **loadSuggestion(type)**:
    - Fetches `/api/exercise?type=<type>`.
    - Updates the prompt text (`Convert to past tense:` or `Use the X:`) and displays the new suggestion.
 4. **Tab & Card Handlers**:
    - Clicking tabs or scoreboard cards switches categories, reloads prompts, and resets UI elements.
 5. **Recording & Processing**:
    - Uses `MediaRecorder` to capture audio, then sends to `/api/process` with exercise metadata.
    - On response: plays TTS audio, animates avatar (clap/encourage), updates scoring/streak/milestone/global bonus, and shows confetti/modal on full completion.

 ## Styling & Animations (public/style.css)
 - **CSS Variables**: Color palette, radii, typography.
 - **Layout**: Flex/Grid for scoreboard, tabs, results.
 - **Animations**:
   - `.avatar.clap` & `.avatar.encourage` keyframes.
   - Confetti pieces, loader spinner.
 - **Responsive**: Progress bars under tabs, adaptive results grid.

 ## Customization
 - **Adding Exercises**: Extend the `type` map in `server.js` and `app.js` for new categories.
 - **Voice & TTS Settings**: Tweak `openai.audio.speech.create` parameters (voice, instructions).
 - **Styling**: Modify CSS variables or add new backgrounds in `style.css`.

 ## Troubleshooting
 - Ensure `OPENAI_API_KEY` is valid and has sufficient quota.
 - Check network console for rate‐limit 429 errors; the server retries automatically.
 - If audio recording fails, verify HTTPS and microphone permissions.

 ## License
 This project is unlicensed. Feel free to adapt and integrate into your own applications.