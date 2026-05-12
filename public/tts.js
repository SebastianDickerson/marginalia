(function () {
  const cfg = window.MARGINALIA_CONFIG.tts;
  const STORAGE_KEY = 'marginalia.tts';

  let enabled = localStorage.getItem(STORAGE_KEY) === 'on';
  let resolvedVoice = null;
  let speaking = false;
  let pendingText = null;

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

  function utter(text) {
    if (!synth) return;
    speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    if (resolvedVoice) u.voice = resolvedVoice;
    u.rate = cfg.rate;
    u.pitch = cfg.pitch;
    u.onend = u.onerror = () => {
      speaking = false;
      if (!enabled) {
        pendingText = null;
        return;
      }
      if (pendingText) {
        const next = pendingText;
        pendingText = null;
        utter(next);
      }
    };
    synth.speak(u);
  }

  function setEnabled(next) {
    enabled = next;
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    if (!enabled) {
      pendingText = null;
      speaking = false;
      if (synth) synth.cancel();
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
    speak(text) {
      if (!enabled || !text || !synth) return;
      if (speaking) {
        pendingText = text;
        return;
      }
      utter(text);
    },
    isEnabled() {
      return enabled;
    },
  };
})();
