const bootMessages = [
  'Detecting display adapter... CRT-2600 OK',
  'Loading filmography database...',
  'Film 01–05 ...................... OK',
  'Shader compilation complete.',
  'Starting projection...',
];

/**
 * Plays the boot sequence in the HTML overlay.
 * @param {Function} onReady — called when boot messages finish (before fade); call fadeOut() to dismiss
 * @param {Function} [onUpdate] — called each step with (messagesArray, progress0to1, statusText)
 */
export function initBootScreen(onReady, onUpdate) {
  const bootScreen = document.getElementById('boot-screen');
  const bootText = document.getElementById('boot-text');
  const bootProgress = document.getElementById('boot-progress');
  const bootStatus = document.getElementById('boot-status');

  let messageIndex = 0;
  const displayed = [];

  /** Fade out the boot screen, returns a Promise that resolves when hidden */
  function fadeOut() {
    return new Promise((resolve) => {
      bootScreen.classList.add('fade-out');
      setTimeout(() => {
        bootScreen.classList.add('hidden');
        resolve();
      }, 600);
    });
  }

  function typeMessage() {
    if (messageIndex >= bootMessages.length) {
      bootStatus.textContent = 'Ready.';
      bootProgress.style.width = '100%';
      if (onUpdate) onUpdate([...displayed], 1, 'Ready.');

      // Messages done — hand control to caller; they decide when to fade
      setTimeout(() => onReady(fadeOut), 50);
      return;
    }

    const msg = bootMessages[messageIndex];
    const line = document.createElement('div');
    line.textContent = msg;
    bootText.appendChild(line);
    displayed.push(msg);

    messageIndex++;
    const progress = messageIndex / bootMessages.length;
    bootProgress.style.width = (progress * 100) + '%';
    const status = msg.split('...')[0] + '...';
    bootStatus.textContent = status;

    if (onUpdate) onUpdate([...displayed], progress, status);

    setTimeout(typeMessage, 200 + Math.random() * 150);
  }

  setTimeout(typeMessage, 300);
}
