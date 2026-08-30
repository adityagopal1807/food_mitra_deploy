// FoodMitra — shared site behaviour (nav, chat widget, scroll-to-top)
document.addEventListener('DOMContentLoaded', function () {

  /* Close mobile nav when a link is tapped */
  var navCheck = document.getElementById('nav-check');
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (navCheck) navCheck.checked = false;
    });
  });

  /* Scroll to top button */
  var scrollTop = document.getElementById('scroll-top');
  if (scrollTop) {
    window.addEventListener('scroll', function () {
      scrollTop.classList.toggle('show', window.scrollY > 400);
    });
    scrollTop.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* Floating chat widget */
  var chatFab = document.getElementById('chat-fab');
  var chatWindow = document.getElementById('chat-window');
  var chatClose = document.getElementById('chat-close');
  var chatBox = document.getElementById('chat-box');
  var chatInput = document.getElementById('user-input');
  var chatSend = document.getElementById('chat-send');

  function appendMessage(text, sender) {
    if (!chatBox) return;
    var div = document.createElement('div');
    div.className = 'chat-message ' + (sender === 'user' ? 'user' : 'bot');
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function greetOnce() {
    if (chatBox && chatBox.children.length === 0) {
      appendMessage("Hi! I'm the FoodMitra assistant 🤖 Ask me about listings, orders, donating, OTP/Google login, the leaderboard, or pincodes.", 'bot');
    }
  }

  if (chatFab && chatWindow) {
    chatFab.addEventListener('click', function () {
      chatWindow.classList.toggle('open');
      if (chatWindow.classList.contains('open')) greetOnce();
    });
  }
  if (chatClose && chatWindow) {
    chatClose.addEventListener('click', function () {
      chatWindow.classList.remove('open');
    });
  }

  async function sendMessage() {
    if (!chatInput) return;
    var message = chatInput.value.trim();
    if (!message) return;
    appendMessage(message, 'user');
    chatInput.value = '';
    try {
      var res = await fetch('/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message })
      });
      var data = await res.json();
      appendMessage(data.reply, 'bot');
    } catch (err) {
      appendMessage('⚠️ Error contacting the assistant. Please try again.', 'bot');
    }
  }

  if (chatSend) chatSend.addEventListener('click', sendMessage);
  if (chatInput) {
    chatInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') sendMessage();
    });
  }

  /* Fade-in cards on scroll */
  var cards = document.querySelectorAll('.card, .listing-card');
  if ('IntersectionObserver' in window && cards.length) {
    cards.forEach(function (c) { c.style.opacity = 0; c.style.transform = 'translateY(16px)'; c.style.transition = 'opacity .5s ease, transform .5s ease'; });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = 1;
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    cards.forEach(function (c) { observer.observe(c); });
  }
});
