// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('nav.main');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      nav.classList.toggle('open');
      toggle.textContent = nav.classList.contains('open') ? 'close' : 'menu';
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.textContent = 'menu';
    }));
  }

  // Mark active nav link
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav.main a[data-page]').forEach(a => {
    if (a.dataset.page === path) a.classList.add('active');
  });

  // Terminal typing animation (hero)
  const term = document.querySelector('.terminal-lines');
  if (term) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const script = JSON.parse(term.dataset.script);
    term.innerHTML = '';
    if (reduce) {
      script.forEach(item => term.appendChild(renderLine(item, true)));
      return;
    }
    let i = 0;
    const typeNext = () => {
      if (i >= script.length) return;
      const item = script[i];
      const lineEl = renderLine(item, false);
      term.appendChild(lineEl);
      const textSpan = lineEl.querySelector('.typed');
      const full = textSpan.dataset.full;
      let c = 0;
      const speed = item.speed || 18;
      const typer = setInterval(() => {
        c++;
        textSpan.textContent = full.slice(0, c);
        if (c >= full.length) {
          clearInterval(typer);
          i++;
          setTimeout(typeNext, item.pause || 260);
        }
      }, speed);
    };
    typeNext();
  }
});

function renderLine(item, immediate) {
  const div = document.createElement('div');
  div.className = 'line ' + (item.cls || '');
  if (item.prompt) {
    const p = document.createElement('span');
    p.className = 'prompt';
    p.textContent = item.prompt + ' ';
    div.appendChild(p);
  }
  const span = document.createElement('span');
  span.className = 'typed';
  span.dataset.full = item.text;
  span.textContent = immediate ? item.text : '';
  div.appendChild(span);
  return div;
}
