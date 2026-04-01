const bootMessages = [
  'Detecting display adapter... CRT-2600 OK',
  'Loading filmography database...',
  'Film 01–05 ...................... OK',
  'Shader compilation complete.',
  'Starting projection...',
];

export function initBootScreen(onComplete) {
  const bootScreen = document.getElementById('boot-screen');
  const bootText = document.getElementById('boot-text');
  const bootProgress = document.getElementById('boot-progress');
  const bootStatus = document.getElementById('boot-status');

  let messageIndex = 0;
  let progress = 0;

  function typeMessage() {
    if (messageIndex >= bootMessages.length) {
      bootStatus.textContent = 'Ready.';
      bootProgress.style.width = '100%';
      setTimeout(() => {
        bootScreen.classList.add('fade-out');
        setTimeout(() => {
          bootScreen.classList.add('hidden');
          onComplete();
        }, 500);
      }, 200);
      return;
    }

    const msg = bootMessages[messageIndex];
    const line = document.createElement('div');
    line.textContent = msg;
    bootText.appendChild(line);

    messageIndex++;
    progress = (messageIndex / bootMessages.length) * 100;
    bootProgress.style.width = progress + '%';
    bootStatus.textContent = msg.split('...')[0] + '...';

    setTimeout(typeMessage, 200 + Math.random() * 150);
  }

  setTimeout(typeMessage, 300);
}
