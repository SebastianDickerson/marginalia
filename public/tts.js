(function () {
  const cfg = window.MARGINALIA_CONFIG.tts;
  const STORAGE_KEY = 'marginalia.tts';

  let enabled = localStorage.getItem(STORAGE_KEY) === 'on';
  let resolvedVoice = null;
  let speaking = false;
  let pending = null; // string | { text, audioUrl }
  let currentAudio = null;

  const synth = window.speechSynthesis;
  const btn = document.getElementById('tts-toggle');

  function resolveVoice() {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices.length) return null;
    for (const name of cfg.voicePriority) {
      const v = voices.find((v) => v.name === name);
      if (v) return v;
    }
    return (
      voices.find((v) => /en[-_]GB/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0]
    );
  }

  if (synth) {
    resolvedVoice = resolveVoice();
    if (!resolvedVoice && typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', () => {
        resolvedVoice = resolveVoice();
      });
    }
  }

  function renderButton() {
    if (!btn) return;
    btn.textContent = enabled ? 'silence' : 'narrate aloud';
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  function onFinish() {
    speaking = false;
    currentAudio = null;
    if (!enabled) {
      pending = null;
      return;
    }
    if (pending) {
      const next = pending;
      pending = null;
      play(next);
    }
  }

  function utter(text) {
    if (!synth || !text) {
      onFinish();
      return;
    }
    speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    if (resolvedVoice) u.voice = resolvedVoice;
    u.rate = cfg.rate;
    u.pitch = cfg.pitch;
    u.onend = u.onerror = onFinish;
    synth.speak(u);
  }

  function playAudio(text, audioUrl) {
    let a;
    try {
      a = new Audio(audioUrl);
    } catch {
      utter(text);
      return;
    }
    speaking = true;
    currentAudio = a;
    let fellBack = false;
    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      currentAudio = null;
      utter(text); // utter() calls onFinish on completion
    };
    a.onended = onFinish;
    a.onerror = fallback;
    const promise = a.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(fallback);
    }
  }

  // Accepts a plain string (legacy call site) or a narration object {text, audioUrl?}.
  function play(item) {
    const text = typeof item === 'string' ? item : item && item.text;
    const audioUrl = typeof item === 'object' && item ? item.audioUrl : null;
    if (!text) return;
    if (audioUrl) {
      playAudio(text, audioUrl);
    } else {
      utter(text);
    }
  }

  function setEnabled(next) {
    enabled = next;
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    if (!enabled) {
      pending = null;
      speaking = false;
      if (synth) synth.cancel();
      if (currentAudio) {
        try { currentAudio.pause(); } catch {}
        currentAudio = null;
      }
    } else if (!resolvedVoice) {
      resolvedVoice = resolveVoice();
    }
    renderButton();
  }

  if (btn) {
    btn.addEventListener('click', () => setEnabled(!enabled));
  }
  renderButton();

  window.Marginalia = window.Marginalia || {};
  window.Marginalia.tts = {
    speak(item) {
      if (!enabled || !item) return;
      const text = typeof item === 'string' ? item : item.text;
      if (!text) return;
      if (speaking) {
        pending = item;
        return;
      }
      play(item);
    },
    isEnabled() {
      return enabled;
    },
  };
})();
