(() => {
  const svg = document.getElementById('rideScene');
  const pauseButton = document.getElementById('pauseButton');
  const pauseLabel = document.getElementById('pauseLabel');
  const replayButton = document.getElementById('replayButton');
  const navLinks = [...document.querySelectorAll('.nav-links a')];
  const sections = [...document.querySelectorAll('main section[id]')];

  if (!svg || !pauseButton || !pauseLabel || !replayButton) return;

  let paused = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const setAnimationState = (nextPaused) => {
    paused = nextPaused;

    if (paused) {
      if (typeof svg.pauseAnimations === 'function') svg.pauseAnimations();
    } else if (typeof svg.unpauseAnimations === 'function') {
      svg.unpauseAnimations();
    }

    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseLabel.textContent = paused ? '播放动画' : '暂停动画';
    pauseButton.setAttribute('aria-label', paused ? '播放海边骑行动画' : '暂停海边骑行动画');
  };

  pauseButton.addEventListener('click', () => {
    setAnimationState(!paused);
  });

  replayButton.addEventListener('click', () => {
    if (typeof svg.setCurrentTime === 'function') svg.setCurrentTime(0);
    if (paused) setAnimationState(false);
  });

  // Reduced-motion users still get the illustration and can opt into motion manually.
  if (reducedMotion.matches) setAnimationState(true);
  reducedMotion.addEventListener?.('change', (event) => {
    if (event.matches) setAnimationState(true);
  });

  // Keep the small navigation underline in sync with the visible page section.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        navLinks.forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`);
        });
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0.05, 0.2, 0.5] },
    );
    sections.forEach((section) => observer.observe(section));
  }
})();
