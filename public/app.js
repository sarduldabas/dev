const recBtn = document.getElementById('recBtn');
const origEl = document.getElementById('orig');
const corrEl = document.getElementById('corr');

let mediaRecorder;
let audioChunks = [];

recBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    recBtn.textContent = 'Start Recording';
  } else {
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

      try {
        const resp = await fetch('/api/process', { method: 'POST', body: form });
        // Handle HTTP errors
        if (!resp.ok) {
          const errorData = await resp.json();
          throw new Error(errorData.error || `Request failed with status ${resp.status}`);
        }
        const { original, corrected, audio, mime } = await resp.json();
        origEl.textContent = original;
        corrEl.textContent = corrected;

        const wavBytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
        const audioBlob = new Blob([wavBytes], { type: mime });
        const url = URL.createObjectURL(audioBlob);
        new Audio(url).play();
      } catch (error) {
        console.error(error);
        alert(error.message);
      }
    };

    mediaRecorder.start();
    recBtn.textContent = 'Stop Recording';
  }
});