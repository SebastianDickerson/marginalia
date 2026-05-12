(function () {
  const cfg = window.MARGINALIA_CONFIG;
  const stack = document.getElementById('stack');
  const toast = document.getElementById('toast');

  const replayQueue = [];
  const pauseQueue = [];
  let replayTimer = null;
  let pauseTimer = null;
  let paused = false;
  let toastTimer = null;

  function applyRamp() {
    const lines = Array.from(stack.children).filter((el) => !el.dataset.removing);
    const n = lines.length;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      const opacity = 1.0 - 0.6 * t;
      lines[i].style.opacity = opacity.toFixed(3);
    }
  }

  function createLine(text) {
    const el = document.createElement('div');
    el.className = 'line cursor-pointer';
    el.style.transition = `opacity ${cfg.fadeMs}ms ease-in-out`;
    el.style.opacity = '0';
    el.textContent = text;
    el.addEventListener('click', () => copyLine(el));
    return el;
  }

  function performInsert(narration) {
    if (!narration || typeof narration.text !== 'string') return;
    const el = createLine(narration.text);
    stack.prepend(el);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyRamp());
    });

    const visible = Array.from(stack.children).filter((c) => !c.dataset.removing);
    if (visible.length > cfg.stackSize) {
      for (let i = cfg.stackSize; i < visible.length; i++) {
        const old = visible[i];
        old.dataset.removing = '1';
        old.style.opacity = '0';
        setTimeout(() => old.remove(), cfg.fadeMs);
      }
    }

    if (window.Marginalia && window.Marginalia.tts && window.Marginalia.tts.speak) {
      window.Marginalia.tts.speak(narration.text);
    }
  }

  function enqueueIncoming(narration) {
    if (paused) {
      pauseQueue.push(narration);
      return;
    }
    if (pauseTimer) {
      pauseQueue.push(narration);
      return;
    }
    if (replayTimer) {
      replayQueue.push(narration);
      return;
    }
    performInsert(narration);
  }

  function enqueueReplay(narration) {
    replayQueue.push(narration);
    startReplayDrain();
  }

  function startReplayDrain() {
    if (replayTimer) return;
    const tick = () => {
      replayTimer = null;
      if (paused) {
        replayTimer = setTimeout(tick, cfg.replayStaggerMs);
        return;
      }
      if (!replayQueue.length) return;
      const next = replayQueue.shift();
      performInsert(next);
      if (replayQueue.length) {
        replayTimer = setTimeout(tick, cfg.replayStaggerMs);
      }
    };
    replayTimer = setTimeout(tick, 0);
  }

  function drainPauseQueue() {
    if (pauseTimer) return;
    const tick = () => {
      pauseTimer = null;
      if (!pauseQueue.length) return;
      const next = pauseQueue.shift();
      if (replayTimer) {
        replayQueue.push(next);
      } else {
        performInsert(next);
      }
      if (pauseQueue.length) {
        pauseTimer = setTimeout(tick, cfg.hoverDrainStaggerMs);
      }
    };
    pauseTimer = setTimeout(tick, 0);
  }

  stack.addEventListener('mouseenter', () => {
    paused = true;
  });
  stack.addEventListener('mouseleave', () => {
    paused = false;
    drainPauseQueue();
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
      toastTimer = null;
    }, cfg.toastMs);
  }

  async function copyLine(el) {
    const text = el.textContent;
    try {
      await navigator.clipboard.writeText(text);
      showToast('copied');
    } catch (err) {
      console.error('clipboard write failed', err);
    }
  }

  function parsePayload(raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error('bad SSE payload', err);
      return null;
    }
  }

  const es = new EventSource('/stream');

  es.addEventListener('narration', (event) => {
    const data = parsePayload(event.data);
    if (data) enqueueIncoming(data);
  });

  es.addEventListener('replay', (event) => {
    const data = parsePayload(event.data);
    if (data) enqueueReplay(data);
  });

  es.onmessage = (event) => {
    console.log('unhandled SSE message', event.data);
  };

  es.onerror = (err) => {
    console.log('SSE error (auto-reconnect)', err);
  };
})();
