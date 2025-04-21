// Tabs and suggestion elements
const tabs = document.querySelectorAll('.tab');
// const typeLabelEl = document.getElementById('typeLabel');  // removed nested label span
const suggestionEl = document.getElementById('suggestion');
const promptTextEl = document.getElementById('promptText');
const refreshBtn = document.getElementById('refreshBtn');
const loader = document.getElementById('loader');
const recBtn = document.getElementById('recBtn');
const origEl = document.getElementById('orig');
const corrEl = document.getElementById('corr');
const playBtn = document.getElementById('playBtn');

// Store latest audio URL for replay
let lastAudioUrl = '';
// Current exercise type and suggestion
let currentType = 'tenses';
let currentSuggestion = '';
// Scoring state (persistent in localStorage)
let stats = JSON.parse(localStorage.getItem('ellieStats')) || {
  tenses:      { attempts: 0, points: 0 },
  preposition: { attempts: 0, points: 0 },
  adverb:      { attempts: 0, points: 0 },
  adjective:   { attempts: 0, points: 0 },
  phrasal:     { attempts: 0, points: 0 },
  bonusAwarded: false,
  bonusPoints: 0
};
// Ensure new fields exist for backward compatibility
['tenses','preposition','adverb','adjective','phrasal'].forEach(type => {
  if (stats[type].streak === undefined) stats[type].streak = 0;
  if (stats[type].milestone5 === undefined) stats[type].milestone5 = false;
  if (stats[type].milestone10 === undefined) stats[type].milestone10 = false;
});
if (stats.bonusAwarded === undefined) stats.bonusAwarded = false;
if (stats.bonusPoints === undefined) stats.bonusPoints = 0;

// Update streak UI
function updateStreak() {
  const streakCount = stats[currentType].streak || 0;
  document.getElementById('streak').innerText = streakCount;
}
// Initialize streak on load
updateStreak();

// Update scoreboard UI
function updateScoreboard() {
  ['tenses','preposition','adverb','adjective','phrasal'].forEach(type => {
    const pts = stats[type].points;
    document.getElementById(`score-${type}`).innerText = pts;
  });
  document.getElementById('score-bonus').innerText = stats.bonusAwarded ? stats.bonusPoints : 0;
  const total = ['tenses','preposition','adverb','adjective','phrasal']
    .reduce((sum, t) => sum + stats[t].points, 0)
    + (stats.bonusAwarded ? stats.bonusPoints : 0);
  document.getElementById('score-total').innerText = total;
}
// Initialize scoreboard on load
updateScoreboard();
// Initialize progress bars and background
updateProgressBars();
updateBackground(currentType);
// Update progress bars under tabs
function updateProgressBars() {
  ['tenses','preposition','adverb','adjective','phrasal'].forEach(type => {
    const pct = Math.min((stats[type].points / 50) * 100, 100);
    const bar = document.getElementById(`progress-${type}`);
    if (bar) bar.style.width = `${pct}%`;
  });
}
// Update page background based on current exercise type
function updateBackground(type) {
  document.body.classList.remove('tenses','preposition','adverb','adjective','phrasal');
  document.body.classList.add(type);
}
// Animate avatar for correct or incorrect responses
function animateAvatar(correct) {
  const avatar = document.getElementById('avatar');
  if (!avatar) return;
  avatar.classList.remove('clap','encourage');
  void avatar.offsetWidth;
  avatar.classList.add(correct ? 'clap' : 'encourage');
}
// Show confetti animation
function showConfetti() {
  const container = document.getElementById('confetti');
  const emojis = ['🎉','🎊','✨','🌟'];
  for (let i = 0; i < 30; i++) {
    const span = document.createElement('span');
    span.className = 'confetti-piece';
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    span.style.left = `${Math.random() * 100}vw`;
    span.style.animationDuration = `${3 + Math.random() * 2}s`;
    span.style.animationDelay = `${Math.random()}s`;
    container.appendChild(span);
    span.addEventListener('animationend', () => span.remove());
  }
}
// Show celebration modal
function showCelebrationModal() {
  const modal = document.getElementById('celebrationModal');
  if (modal) modal.style.display = 'flex';
}
// Close modal on click
document.getElementById('closeModal')?.addEventListener('click', () => {
  const modal = document.getElementById('celebrationModal');
  if (modal) modal.style.display = 'none';
});

// Fetch and display a new suggestion for the current exercise type
async function loadSuggestion(type) {
  try {
    const resp = await fetch(`/api/exercise?type=${type}`);
    if (!resp.ok) throw new Error('Failed to fetch suggestion');
    const { suggestion } = await resp.json();
    currentSuggestion = suggestion;
    // Update prompt text and label
    const labelMap = {
      preposition: 'preposition',
      adverb: 'adverb',
      adjective: 'adjective',
      phrasal: 'phrasal verb',
    };
    if (type === 'tenses') {
      promptTextEl.textContent = 'Convert to past tense:';
    } else {
      promptTextEl.textContent = `Use the ${labelMap[type] || type}:`;
    }
    // Show suggestion
    suggestionEl.textContent = suggestion;
  } catch (err) {
    console.error('Error loading suggestion:', err);
  }
}

// Refresh button loads a new suggestion
refreshBtn.addEventListener('click', () => loadSuggestion(currentType));
// Load initial suggestion and set up tabs on page load
loadSuggestion(currentType);
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    // Switch active tab
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    // Reset UI
    currentType = tab.dataset.type;
    origEl.textContent = '';
    corrEl.textContent = '';
    playBtn.style.display = 'none';
    loader.style.display = 'none';
    recBtn.disabled = false;
    refreshBtn.disabled = false;
    recBtn.textContent = 'Say';
    // Load new suggestion for selected type
    loadSuggestion(currentType);
    updateStreak();
    updateBackground(currentType);
    updateProgressBars();
  });
});
// Make scoreboard cards clickable to switch exercises
document.querySelectorAll('.score-item.card').forEach(card => {
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    const type = card.dataset.type;
    // Activate corresponding tab
    tabs.forEach(t => t.classList.toggle('active', t.dataset.type === type));
    currentType = type;
    origEl.textContent = '';
    corrEl.textContent = '';
    playBtn.style.display = 'none';
    loader.style.display = 'none';
    recBtn.disabled = false;
    refreshBtn.disabled = false;
    recBtn.textContent = 'Say';
    loadSuggestion(currentType);
    updateStreak();
    updateBackground(currentType);
    updateProgressBars();
  });
});

// Replay previously generated audio
// Replay previously generated audio
playBtn.addEventListener('click', () => {
  if (lastAudioUrl) {
    new Audio(lastAudioUrl).play();
  }
});

let mediaRecorder;
let audioChunks = [];

recBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Stop recording and begin processing
    mediaRecorder.stop();
    recBtn.textContent = 'Say';
    // Hide play button and show loader
    playBtn.style.display = 'none';
    loader.style.display = 'flex';
    // Disable buttons during processing
    recBtn.disabled = true;
    refreshBtn.disabled = true;
  } else {
    // Start recording
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const form = new FormData();
    form.append('audio', blob, 'speech.webm');
    // include exercise type and suggestion for context
    form.append('type', currentType);
    form.append('suggestion', currentSuggestion);

      try {
        const resp = await fetch('/api/process', { method: 'POST', body: form });
        if (!resp.ok) {
          const errorData = await resp.json();
          throw new Error(errorData.error || `Request failed with status ${resp.status}`);
        }
        const { original, corrected, audio, mime, usageCorrect } = await resp.json();
        origEl.textContent = original;
        corrEl.textContent = corrected;
        // Animate avatar based on correctness
        animateAvatar(usageCorrect);

        // Play server-generated TTS audio
        const audioBytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
        const audioBlob = new Blob([audioBytes], { type: mime });
        const url = URL.createObjectURL(audioBlob);
        new Audio(url).play();
        lastAudioUrl = url;
        playBtn.style.display = 'inline-block';
        // Scoring: award 5 points per attempt, max 10 attempts per type
        const tabStats = stats[currentType];
        if (tabStats.attempts < 10) {
          tabStats.attempts++;
          tabStats.points = Math.min(50, tabStats.points + 5);
        }
        // Handle streak based on correctness
        if (usageCorrect) {
          tabStats.streak++;
        } else {
          tabStats.streak = 0;
        }
        // Milestone bonus for streaks
        if (usageCorrect && tabStats.streak >= 5 && !tabStats.milestone5) {
          tabStats.points += 10;
          tabStats.milestone5 = true;
        }
        if (usageCorrect && tabStats.streak >= 10 && !tabStats.milestone10) {
          tabStats.points += 20;
          tabStats.milestone10 = true;
        }
        // Global bonus: 50 points if each type has at least 50 points
        let earnedGlobalBonus = false;
        if (!stats.bonusAwarded && ['tenses','preposition','adverb','adjective','phrasal']
            .every(t => stats[t].points >= 50)) {
          stats.bonusAwarded = true;
          stats.bonusPoints = 50;
          earnedGlobalBonus = true;
        }
        localStorage.setItem('ellieStats', JSON.stringify(stats));
        updateScoreboard();
        updateProgressBars();
        updateStreak();
        if (earnedGlobalBonus) {
          showConfetti();
          showCelebrationModal();
        }
        // Hide loader and re-enable buttons
        loader.style.display = 'none';
        recBtn.disabled = false;
        refreshBtn.disabled = false;
      } catch (error) {
        console.error(error);
        alert(error.message);
        // Hide loader and re-enable buttons on error
        loader.style.display = 'none';
        recBtn.disabled = false;
        refreshBtn.disabled = false;
      }
    };

    mediaRecorder.start();
    recBtn.textContent = 'Stop';
  }
});