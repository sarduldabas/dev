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
// Main navigation tabs and screens
const navTabs = document.querySelectorAll('.nav-tab');
const screens = document.querySelectorAll('.screen');
// Translate screen elements
const translateRecBtn = document.getElementById('translateRecBtn');
const translateLoader = document.getElementById('translateLoader');
const translationEl = document.getElementById('translation');
let translateMediaRecorder, translateAudioChunks;
// Waveform canvas for live audio
const waveform = document.getElementById('waveform');
// Speech recognition and waveform variables
let recognition;
let audioContext, audioSource, analyser, dataArray, bufferLength, animationId;
// Draw waveform using analyser
function drawWaveform() {
  if (!analyser) return;
  animationId = requestAnimationFrame(drawWaveform);
  analyser.getByteTimeDomainData(dataArray);
  const ctx = waveform.getContext('2d');
  const width = waveform.width;
  const height = waveform.height;
  // Clear canvas with light background
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, 0, width, height);
  // Draw waveform line
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3b82f6';
  ctx.beginPath();
  const sliceWidth = width / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = v * (height / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  // Fill area under waveform curve
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(59,130,246,0.3)';
  ctx.fill();
}

// Play streamed audio preview via MediaSource Extensions
async function playStreamedAudio(form) {
  const mediaSource = new MediaSource();
  const audioEl = new Audio();
  audioEl.src = URL.createObjectURL(mediaSource);
  mediaSource.addEventListener('sourceopen', async () => {
    const sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs="opus"');
    const resp = await fetch('/api/process-stream', { method: 'POST', body: form });
    if (!resp.ok) throw new Error('Audio stream failed with status ' + resp.status);
    const reader = resp.body.getReader();
    let played = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sourceBuffer.appendBuffer(value);
      await new Promise(resolve => sourceBuffer.addEventListener('updateend', resolve, { once: true }));
      if (!played) {
        audioEl.play().catch(console.error);
        played = true;
        lastAudioEl = audioEl;
        playBtn.style.display = 'inline-block';
      }
    }
    mediaSource.endOfStream();
  });
}


// Store last audio element for replay
let lastAudioEl = null;
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
    const data = await resp.json();
    const suggestion = data.suggestion;
    currentSuggestion = suggestion;
    // Update prompt text and label
    const labelMap = {
      preposition: 'preposition',
      adverb: 'adverb',
      adjective: 'adjective',
      phrasal: 'phrasal verb',
    };
    if (type === 'tenses') {
      promptTextEl.textContent = `Convert from ${data.source} to ${data.target}:`;
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
    recBtn.textContent = 'Start Practising';
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
    recBtn.textContent = 'Start Practising';
    loadSuggestion(currentType);
    updateStreak();
    updateBackground(currentType);
    updateProgressBars();
  });
});

// Replay last streamed audio
playBtn.addEventListener('click', () => {
  if (lastAudioEl) {
    lastAudioEl.play();
  }
});
// Practice recording and processing
let mediaRecorder;
let audioChunks = [];
recBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Stop recording and begin processing
    mediaRecorder.stop();
    recBtn.textContent = 'Start Practising';
    // Hide play button and show loader
    playBtn.style.display = 'none';
    loader.style.display = 'flex';
    // Disable buttons during processing
    recBtn.disabled = true;
    refreshBtn.disabled = true;
  } else {
    // Start recording
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Show waveform and start analyser
    audioContext = new AudioContext();
    audioSource = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    audioSource.connect(analyser);
    analyser.fftSize = 2048;
    bufferLength = analyser.fftSize;
    dataArray = new Uint8Array(bufferLength);
    waveform.style.display = 'block';
    drawWaveform();
    // Start speech recognition for real-time transcription
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += transcript;
          else interim += transcript;
        }
        origEl.textContent = final + interim;
      };
      recognition.start();
    }
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      // Stop real-time transcription and waveform display
      if (recognition) recognition.stop();
      if (animationId) cancelAnimationFrame(animationId);
      if (audioContext) audioContext.close();
      waveform.style.display = 'none';
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const form = new FormData();
      form.append('audio', blob, 'speech.webm');
      // include exercise type and suggestion for context
      form.append('type', currentType);
      form.append('suggestion', currentSuggestion);

      try {
        // Get feedback, TTS audio and update UI
        const resp = await fetch('/api/process', { method: 'POST', body: form });
        if (!resp.ok) throw new Error((await resp.json()).error || `Status ${resp.status}`);
        const { original, corrected, usageCorrect, audio: base64Audio, mime } = await resp.json();
        // Display text results
        origEl.textContent = original;
        corrEl.textContent = corrected;
        animateAvatar(usageCorrect);
        // Update scoring
        const tabStats = stats[currentType];
        if (tabStats.attempts < 10) { tabStats.attempts++; tabStats.points = Math.min(50, tabStats.points + 5); }
        if (usageCorrect) tabStats.streak++; else tabStats.streak = 0;
        if (usageCorrect && tabStats.streak >= 5 && !tabStats.milestone5) { tabStats.points += 10; tabStats.milestone5 = true; }
        if (usageCorrect && tabStats.streak >= 10 && !tabStats.milestone10) { tabStats.points += 20; tabStats.milestone10 = true; }
        if (!stats.bonusAwarded && ['tenses','preposition','adverb','adjective','phrasal'].every(t => stats[t].points >= 50)) {
          stats.bonusAwarded = true; stats.bonusPoints = 50;
          showConfetti(); showCelebrationModal();
        }
        localStorage.setItem('ellieStats', JSON.stringify(stats));
        updateScoreboard(); updateProgressBars(); updateStreak();
        // Hide loader and re-enable buttons
        loader.style.display = 'none'; recBtn.disabled = false; refreshBtn.disabled = false;
        // Play TTS audio from base64 response
        const binary = atob(base64Audio);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
        const ttsBlob = new Blob([buffer], { type: mime });
        const ttsUrl = URL.createObjectURL(ttsBlob);
        const audioEl = new Audio(ttsUrl);
        audioEl.play().catch(console.error);
        lastAudioEl = audioEl;
        playBtn.style.display = 'inline-block';
      } catch (error) {
        console.error(error); alert(error.message);
        loader.style.display = 'none'; recBtn.disabled = false; refreshBtn.disabled = false;
      }
    };
    mediaRecorder.start();
    recBtn.textContent = 'Stop';
  }
});
// ---------------------------------------------
// Additional screens and navigation
// Handle main navigation between screens
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    screens.forEach(s => s.style.display = 'none');
    const screenId = `${tab.dataset.screen}-screen`;
    const screenEl = document.getElementById(screenId);
    if (screenEl) screenEl.style.display = 'block';
    if (screenId === 'admin-screen') renderAdminStats();
  });
});
// Translate screen: record and translate audio
if (translateRecBtn) {
  translateRecBtn.addEventListener('click', async () => {
    if (translateMediaRecorder && translateMediaRecorder.state === 'recording') {
      translateMediaRecorder.stop();
      translateRecBtn.textContent = 'Start Speaking';
      translateRecBtn.disabled = true;
      translateLoader.style.display = 'flex';
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      translateMediaRecorder = new MediaRecorder(stream);
      translateAudioChunks = [];
      translateMediaRecorder.ondataavailable = e => translateAudioChunks.push(e.data);
      translateMediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        translateLoader.style.display = 'none';
        translateRecBtn.disabled = false;
        const blob = new Blob(translateAudioChunks, { type: 'audio/webm' });
        const form = new FormData();
        form.append('audio', blob, 'speech.webm');
        try {
          const resp = await fetch('/api/translate', { method: 'POST', body: form });
          if (!resp.ok) throw new Error((await resp.json()).error || `Status ${resp.status}`);
          const { translation } = await resp.json();
          translationEl.textContent = translation;
        } catch (err) {
          console.error(err);
          alert(err.message);
        }
      };
      translateMediaRecorder.start();
      translateRecBtn.textContent = 'Stop';
    }
  });
}
// Render admin/progress stats with timeframe filters
let currentRange = 'day';
function renderAdminStats(range = currentRange) {
  currentRange = range;
  const adminStatsEl = document.getElementById('admin-stats');
  if (!adminStatsEl) return;
  // Filter history for timeframe
  const history = JSON.parse(localStorage.getItem('ellieHistory') || '[]');
  const now = Date.now();
  let threshold = 0;
  if (range === 'day') threshold = now - 24 * 3600 * 1000;
  else if (range === 'week') threshold = now - 7 * 24 * 3600 * 1000;
  else if (range === 'month') threshold = now - 30 * 24 * 3600 * 1000;
  const filtered = history.filter(ev => ev.timestamp >= threshold);
  const total = filtered.length;
  const success = filtered.filter(ev => ev.success).length;
  const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
  // Clear and render summary
  adminStatsEl.innerHTML = '';
  const summaryCard = document.createElement('div');
  summaryCard.className = 'score-item';
  summaryCard.innerHTML = `
    <p class="label">Summary (${range})</p>
    <p>Attempts: ${total}</p>
    <p>Success Rate: ${successRate}%</p>`;
  adminStatsEl.appendChild(summaryCard);
  // Render type-level cumulative stats
  ['tenses','preposition','adverb','adjective','phrasal'].forEach(type => {
    const s = stats[type];
    const card = document.createElement('div');
    card.className = 'score-item';
    card.innerHTML = `
      <p class="label">${type.charAt(0).toUpperCase() + type.slice(1)}</p>
      <p>Attempts: ${s.attempts}</p>
      <p>Points: ${s.points}</p>
      <p>Streak: ${s.streak}</p>`;
    adminStatsEl.appendChild(card);
  });
  if (stats.bonusAwarded) {
    const bonusCard = document.createElement('div');
    bonusCard.className = 'score-item';
    bonusCard.innerHTML = `
      <p class="label">Bonus</p>
      <p>Points: ${stats.bonusPoints}</p>`;
    adminStatsEl.appendChild(bonusCard);
  }
}
// KPI filter buttons
const kpiFilterBtns = document.querySelectorAll('.kpi-filter');
kpiFilterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const range = btn.dataset.range;
    kpiFilterBtns.forEach(b => b.classList.toggle('active', b === btn));
    renderAdminStats(range);
  });
});

// Article navigation & comments
const articles = [
  { id: 'philosophy', title: 'The Philosophy Behind This App', content: 'Our mission is to make language practice as natural and engaging as conversation with a friend...' },
  { id: 'usage', title: 'How to Use It', content: 'Navigate to the Practice tab to train your grammar, use Translate to get speech translations...' },
  { id: 'benefits', title: 'Key Benefits', content: 'Build confidence in speaking, get instant feedback, track progress, and learn at your own pace...' }
];
// Render articles navigation
function renderArticlesNav() {
  const navList = document.getElementById('articles-nav-list');
  if (!navList) return;
  navList.innerHTML = '';
  articles.forEach((a, i) => {
    const li = document.createElement('li');
    li.textContent = a.title;
    li.dataset.id = a.id;
    if (i === 0) li.classList.add('active');
    li.addEventListener('click', () => displayArticle(a.id));
    navList.appendChild(li);
  });
  displayArticle(articles[0].id);
}
// Display selected article and comments
function displayArticle(id) {
  const article = articles.find(a => a.id === id);
  const contentEl = document.getElementById('article-content');
  if (contentEl && article) {
    contentEl.innerHTML = '<h2>' + article.title + '</h2><p>' + article.content + '</p>';
  }
  document.querySelectorAll('#articles-nav-list li').forEach(li => li.classList.toggle('active', li.dataset.id === id));
  renderComments(id);
}
// Comments section
function renderComments(articleId) {
  const commentsList = document.getElementById('comments-list');
  if (!commentsList) return;
  const comments = JSON.parse(localStorage.getItem('comments_' + articleId) || '[]');
  commentsList.innerHTML = comments.map(c => '<li>' + c + '</li>').join('');
}
const commentInput = document.getElementById('comment-input');
const commentSubmit = document.getElementById('comment-submit');
if (commentSubmit) {
  commentSubmit.addEventListener('click', () => {
    const active = document.querySelector('#articles-nav-list li.active');
    if (!active) return;
    const articleId = active.dataset.id;
    const text = commentInput.value.trim();
    if (!text) return;
    const key = 'comments_' + articleId;
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push(text);
    localStorage.setItem(key, JSON.stringify(arr));
    commentInput.value = '';
    renderComments(articleId);
  });
}
// Initialize articles navigation
renderArticlesNav();