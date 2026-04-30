/**
 * ClinicBridge AI Widget v2.0
 * Injectable standalone assistant widget for clinic websites.
 * Usage: <script src="clinicbridge-widget.js" data-clinic-id="nova-dental" data-lang="en"></script>
 * Public API: window.ClinicBridgeWidget.open() / .close() / .sendMessage(text)
 */
(function (w, d) {
  'use strict';

  const script = d.currentScript || d.querySelector('script[data-clinic-id]');
  const cfg = {
    clinicId: script?.dataset.clinicId || 'demo',
    lang: script?.dataset.lang || 'en',
    disableBubbles: script?.dataset.disableBubbles === 'true',
  };

  /* ── CONTENT ─────────────────────────────────────── */
  const WELCOME = {
    en: "Hello! I'm the virtual assistant of Nova Dental Clinic. I can help you find the right treatment, answer your questions, or guide you to book an appointment. 😊",
    tr: "Merhaba! Nova Diş Kliniği'nin sanal asistanıyım. Doğru tedaviyi bulmanıza, sorularınızı yanıtlamaya veya randevu almanıza yardımcı olabilirim. 😊",
  };

  const BUBBLES = {
    en: ['Need help choosing a treatment?', 'Ask me about implant options', 'Want to book an appointment?', 'Not sure where to start?'],
    tr: ['Hangi tedavinin size uygun olduğunu merak mı ediyorsunuz?', 'İmplant seçenekleri hakkında bilgi alabilirsiniz', 'Randevu almak ister misiniz?', 'Nereden başlayacağınızı bilmiyor musunuz?'],
  };

  const QUICK = {
    en: [
      { label: '📅 Book an appointment', msg: 'book' },
      { label: '🦷 Which treatment suits me?', msg: 'treatment' },
      { label: '🔩 Implant information', msg: 'implant' },
      { label: '💬 Contact on WhatsApp', msg: 'whatsapp' },
    ],
    tr: [
      { label: '📅 Randevu almak istiyorum', msg: 'book' },
      { label: '🦷 Hangi tedavi uygun?', msg: 'treatment' },
      { label: '🔩 İmplant bilgisi', msg: 'implant' },
      { label: '💬 WhatsApp ile iletişim', msg: 'whatsapp' },
    ],
  };

  const RESPONSES = {
    en: {
      book: "Of course! You can book via our <a href='#contact' style='color:#3B82F6;font-weight:600'>appointment form</a> or call <strong>+1 (800) 668-2536</strong>. We'll confirm within 24 hours. 📅",
      treatment: "The right treatment depends on your needs. A <strong>Dental Check-up</strong> is the ideal starting point. Interested in aesthetics? A <strong>Smile Design</strong> consultation with Dr. Vasquez is perfect. Shall I help schedule one? 😊",
      implant: "Implants at Nova Dental are performed by <strong>Dr. Marcus Reid</strong>, our specialist with 18+ years experience. It's a permanent, natural-looking solution done under local anesthesia in 1–2 visits. Would you like a free consultation? 🦷",
      whatsapp: "Reach our team on WhatsApp: <a href='https://wa.me/18006682536' target='_blank' style='color:#3B82F6;font-weight:600'>+1 (800) 668-2536</a> 💬<br>Available Mon–Sat, 8 AM – 7 PM.",
      default: ["Thank you! I recommend booking a <a href='#contact' style='color:#3B82F6;font-weight:600'>free consultation</a> for personalized guidance. 😊", "Great question! Call us at <strong>+1 (800) 668-2536</strong> or email <strong>hello@novadentalclinic.com</strong> — we'd love to help.", "Happy to help! Speaking with our patient coordinators directly would give you the most accurate answer. Shall I connect you?"],
    },
    tr: {
      book: "Tabii ki! <a href='#contact' style='color:#3B82F6;font-weight:600'>Randevu formumuzu</a> doldurabilir veya <strong>+1 (800) 668-2536</strong> numaralı hattı arayabilirsiniz. 24 saat içinde dönüş yapılır. 📅",
      treatment: "Doğru tedavi kişisel ihtiyaçlarınıza bağlıdır. <strong>Diş Kontrolü</strong> harika bir başlangıç noktasıdır. Estetikle ilgileniyorsanız <strong>Gülüş Tasarımı</strong> danışmanlığı idealdir. Randevu ayarlamamı ister misiniz? 😊",
      implant: "Nova Diş'te implant tedavisi, 18+ yıl deneyimli uzmanımız <strong>Dr. Marcus Reid</strong> tarafından yapılır. Lokal anestezi altında 1-2 seansta uygulanan kalıcı bir çözümdür. Ücretsiz konsültasyon ister misiniz? 🦷",
      whatsapp: "Ekibimize WhatsApp üzerinden ulaşın: <a href='https://wa.me/18006682536' target='_blank' style='color:#3B82F6;font-weight:600'>+1 (800) 668-2536</a> 💬<br>Pzt–Cmt, 08:00–19:00.",
      default: ["Mesajınız için teşekkürler! <a href='#contact' style='color:#3B82F6;font-weight:600'>Ücretsiz konsültasyon</a> randevusu almanızı öneririm. 😊", "Hasta koordinatörlerimiz size yardımcı olmaktan mutluluk duyar. <strong>+1 (800) 668-2536</strong> numaralı hattı arayabilirsiniz.", "Yardımcı olmaktan memnuniyet duyarım! Uzmanlarımızla görüşmenizi öneririm."],
    },
  };

  /* ── CSS ─────────────────────────────────────────── */
  const CSS = `
    #cbw-root{position:fixed;bottom:28px;right:28px;z-index:2147483640;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif}
    #cbw-launcher{width:60px;height:60px;border-radius:18px;border:none;cursor:pointer;background:linear-gradient(145deg,#3B82F6 0%,#1D4ED8 100%);box-shadow:0 8px 28px rgba(59,130,246,.45);display:flex;align-items:center;justify-content:center;position:relative;transition:transform .25s,box-shadow .25s;flex-shrink:0;outline:none}
    #cbw-launcher:hover{transform:scale(1.08) translateY(-2px);box-shadow:0 12px 36px rgba(59,130,246,.55)}
    #cbw-launcher:focus-visible{outline:3px solid #93C5FD;outline-offset:3px}
    #cbw-online{position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;background:#22C55E;border:2.5px solid #fff;animation:cbw-ping 2.5s infinite}
    @keyframes cbw-ping{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}60%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}
    #cbw-bubbles{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
    .cbw-bubble{background:#fff;border:1px solid rgba(59,130,246,.15);border-radius:20px 20px 4px 20px;padding:10px 14px;font-size:13.5px;color:#1e293b;box-shadow:0 4px 18px rgba(0,0,0,.11);display:flex;align-items:center;gap:9px;max-width:236px;line-height:1.4;cursor:pointer;transition:box-shadow .2s,transform .2s;animation:cbw-bubble-in .35s cubic-bezier(.34,1.56,.64,1)}
    .cbw-bubble:hover{box-shadow:0 6px 22px rgba(0,0,0,.15);transform:translateX(-3px)}
    .cbw-bdot{width:8px;height:8px;border-radius:50%;background:#3B82F6;flex-shrink:0}
    .cbw-bx{margin-left:auto;color:#94A3B8;font-size:14px;line-height:1;flex-shrink:0;padding:0 1px}
    .cbw-bx:hover{color:#64748B}
    @keyframes cbw-bubble-in{from{opacity:0;transform:translateY(10px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
    #cbw-panel{position:absolute;bottom:74px;right:0;width:360px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05);overflow:hidden;display:flex;flex-direction:column;transform:scale(.88) translateY(24px);transform-origin:bottom right;opacity:0;pointer-events:none;transition:all .32s cubic-bezier(.34,1.56,.64,1)}
    #cbw-panel.cbw-open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}
    #cbw-head{background:linear-gradient(135deg,#3B82F6 0%,#1D4ED8 100%);padding:17px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .cbw-hleft{display:flex;align-items:center;gap:12px}
    .cbw-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .cbw-hname{display:block;font-size:13.5px;font-weight:700;color:#fff}
    .cbw-hstatus{display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.8);margin-top:2px}
    .cbw-sdot{width:7px;height:7px;border-radius:50%;background:#86EFAC;display:inline-block}
    #cbw-close{background:rgba(255,255,255,.18);border:none;border-radius:8px;cursor:pointer;padding:7px;display:flex;transition:background .2s;color:#fff}
    #cbw-close:hover{background:rgba(255,255,255,.3)}
    #cbw-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:180px;max-height:260px;scroll-behavior:smooth}
    .cbw-msg{display:flex;flex-direction:column;gap:3px}
    .cbw-bubble-msg{padding:11px 15px;font-size:14px;line-height:1.65;max-width:86%;color:#1e293b}
    .cbw-bot .cbw-bubble-msg{background:#F1F5F9;border-radius:4px 16px 16px 16px}
    .cbw-user{align-items:flex-end}
    .cbw-user .cbw-bubble-msg{background:linear-gradient(135deg,#3B82F6,#1D4ED8);color:#fff;border-radius:16px 4px 16px 16px}
    .cbw-ts{font-size:11px;color:#94A3B8;padding:0 4px}
    .cbw-user .cbw-ts{text-align:right}
    .cbw-typing .cbw-bubble-msg{display:flex;gap:5px;align-items:center;padding:14px 18px}
    .cbw-tdot{width:8px;height:8px;border-radius:50%;background:#94A3B8;animation:cbw-bounce .8s infinite}
    .cbw-tdot:nth-child(2){animation-delay:.15s}.cbw-tdot:nth-child(3){animation-delay:.3s}
    @keyframes cbw-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
    #cbw-quick{padding:10px 14px;display:flex;flex-direction:column;gap:7px;border-top:1px solid #E2E8F0;flex-shrink:0}
    .cbw-qbtn{background:#EFF6FF;border:1.5px solid #DBEAFE;border-radius:10px;padding:9px 13px;font-size:13px;font-weight:500;color:#2563EB;cursor:pointer;text-align:left;transition:all .2s;font-family:inherit}
    .cbw-qbtn:hover{background:#DBEAFE;border-color:#93C5FD}
    #cbw-inputrow{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid #E2E8F0;flex-shrink:0}
    #cbw-input{flex:1;border:1.5px solid #E2E8F0;border-radius:10px;padding:10px 14px;font-size:14px;font-family:inherit;outline:none;transition:border-color .2s;color:#1e293b;background:#fff}
    #cbw-input:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}
    #cbw-send{width:38px;height:38px;border-radius:10px;border:none;cursor:pointer;background:linear-gradient(135deg,#3B82F6,#1D4ED8);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .2s}
    #cbw-send:hover{transform:scale(1.08)}
    @media(max-width:480px){#cbw-panel{width:calc(100vw - 32px);right:-4px}}
  `;

  /* ── LAUNCHER ICON SVG ───────────────────────────── */
  /* Premium tooth + AI sparkle — no generic speech bubble */
  const ICON_SVG = `<svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 3.5C12 3.5 9.5 5.8 9 8.8C8.4 6.2 6.4 4.5 5 4.5C5 4.5 6 10 8 13C9.3 15.2 10 18 10 21C10 23.5 11 26 12.8 26C14 26 14.8 24.8 15 22.8C15.2 24.8 16 26 17.2 26C19 26 20 23.5 20 21C20 18 20.7 15.2 22 13C24 10 25 4.5 25 4.5C23.6 4.5 21.6 6.2 21 8.8C20.5 5.8 18 3.5 15 3.5Z" fill="white" opacity="0.93"/>
    <path d="M23 6L23.6 7.8L25.4 8.4L23.6 9L23 10.8L22.4 9L20.6 8.4L22.4 7.8L23 6Z" fill="white"/>
    <circle cx="20" cy="4.5" r="1" fill="white" opacity="0.7"/>
  </svg>`;

  const AVATAR_SVG = `<svg width="22" height="22" viewBox="0 0 30 30" fill="none"><path d="M15 3.5C12 3.5 9.5 5.8 9 8.8C8.4 6.2 6.4 4.5 5 4.5C5 4.5 6 10 8 13C9.3 15.2 10 18 10 21C10 23.5 11 26 12.8 26C14 26 14.8 24.8 15 22.8C15.2 24.8 16 26 17.2 26C19 26 20 23.5 20 21C20 18 20.7 15.2 22 13C24 10 25 4.5 25 4.5C23.6 4.5 21.6 6.2 21 8.8C20.5 5.8 18 3.5 15 3.5Z" fill="white" opacity="0.9"/><path d="M23 6L23.4 7.4L24.8 7.8L23.4 8.2L23 9.6L22.6 8.2L21.2 7.8L22.6 7.4L23 6Z" fill="white"/></svg>`;

  const CLOSE_SVG = `<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  const SEND_SVG = `<svg width="17" height="17" fill="none" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  /* ── BUILD DOM ───────────────────────────────────── */
  function inject() {
    // Style
    const style = d.createElement('style');
    style.textContent = CSS;
    d.head.appendChild(style);

    const lang = cfg.lang in BUBBLES ? cfg.lang : 'en';
    const qItems = QUICK[lang];
    const resp = RESPONSES[lang];

    // Root
    const root = d.createElement('div');
    root.id = 'cbw-root';

    // Bubbles container
    const bubblesEl = d.createElement('div');
    bubblesEl.id = 'cbw-bubbles';
    root.appendChild(bubblesEl);

    // Panel
    root.innerHTML += `
      <div id="cbw-panel" role="dialog" aria-label="ClinicBridge AI Assistant" aria-hidden="true">
        <div id="cbw-head">
          <div class="cbw-hleft">
            <div class="cbw-avatar">${AVATAR_SVG}</div>
            <div>
              <span class="cbw-hname">ClinicBridge AI Assistant</span>
              <div class="cbw-hstatus"><span class="cbw-sdot"></span>Online</div>
            </div>
          </div>
          <button id="cbw-close" aria-label="Close assistant">${CLOSE_SVG}</button>
        </div>
        <div id="cbw-msgs"></div>
        <div id="cbw-quick">
          ${qItems.map(q => `<button class="cbw-qbtn" data-key="${q.msg}">${q.label}</button>`).join('')}
        </div>
        <div id="cbw-inputrow">
          <input id="cbw-input" type="text" placeholder="Type your message…" autocomplete="off"/>
          <button id="cbw-send" aria-label="Send">${SEND_SVG}</button>
        </div>
      </div>
      <button id="cbw-launcher" aria-label="Open ClinicBridge AI Assistant">
        ${ICON_SVG}
        <span id="cbw-online"></span>
      </button>
    `;

    d.body.appendChild(root);

    // Re-query after innerHTML (bubbles el was set before)
    const panel = d.getElementById('cbw-panel');
    const launcher = d.getElementById('cbw-launcher');
    const closeBtn = d.getElementById('cbw-close');
    const msgs = d.getElementById('cbw-msgs');
    const input = d.getElementById('cbw-input');
    const sendBtn = d.getElementById('cbw-send');
    const quickEl = d.getElementById('cbw-quick');

    /* ── STATE ── */
    let isOpen = false;

    /* ── WELCOME MESSAGE ── */
    appendMsg(WELCOME[lang] || WELCOME.en, false, msgs, true);

    /* ── BUBBLE SYSTEM ── */
    let bubbleIndex = 0;
    let bubbleTimer = null;
    let currentBubble = null;
    const bubbleTexts = BUBBLES[lang] || BUBBLES.en;

    function showNextBubble() {
      if (isOpen || cfg.disableBubbles) return;
      if (currentBubble) {
        currentBubble.style.opacity = '0';
        currentBubble.style.transform = 'translateY(4px)';
        currentBubble.style.transition = 'opacity .3s, transform .3s';
        setTimeout(() => { if (currentBubble) currentBubble.remove(); currentBubble = null; }, 320);
      }
      setTimeout(() => {
        if (isOpen) return;
        const text = bubbleTexts[bubbleIndex % bubbleTexts.length];
        bubbleIndex++;
        const el = d.createElement('div');
        el.className = 'cbw-bubble';
        el.innerHTML = `<span class="cbw-bdot"></span><span style="flex:1">${text}</span><span class="cbw-bx" aria-label="Dismiss">×</span>`;
        el.querySelector('.cbw-bx').addEventListener('click', (e) => { e.stopPropagation(); clearBubbles(); });
        el.addEventListener('click', () => { openPanel(); });
        bubblesEl.appendChild(el);
        currentBubble = el;
        bubbleTimer = setTimeout(showNextBubble, 5000);
      }, 350);
    }

    function clearBubbles() {
      clearTimeout(bubbleTimer);
      if (currentBubble) { currentBubble.remove(); currentBubble = null; }
    }

    if (!cfg.disableBubbles) setTimeout(showNextBubble, 3500);

    /* ── OPEN / CLOSE ── */
    function openPanel() {
      isOpen = true;
      clearBubbles();
      panel.classList.add('cbw-open');
      panel.setAttribute('aria-hidden', 'false');
      input.focus();
    }
    function closePanel() {
      isOpen = false;
      panel.classList.remove('cbw-open');
      panel.setAttribute('aria-hidden', 'true');
      if (!cfg.disableBubbles) setTimeout(showNextBubble, 8000);
    }

    launcher.addEventListener('click', () => isOpen ? closePanel() : openPanel());
    closeBtn.addEventListener('click', closePanel);

    /* ── MESSAGES ── */
    function getTime() {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    function appendMsg(text, isUser, container, isWelcome) {
      const div = d.createElement('div');
      div.className = `cbw-msg ${isUser ? 'cbw-user' : 'cbw-bot'}`;
      div.innerHTML = `<div class="cbw-bubble-msg">${text}</div><span class="cbw-ts">${isWelcome ? 'Just now' : getTime()}</span>`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
    function showTyping() {
      const div = d.createElement('div');
      div.id = 'cbw-typing';
      div.className = 'cbw-msg cbw-bot cbw-typing';
      div.innerHTML = `<div class="cbw-bubble-msg"><span class="cbw-tdot"></span><span class="cbw-tdot"></span><span class="cbw-tdot"></span></div>`;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }
    function removeTyping() { const t = d.getElementById('cbw-typing'); if (t) t.remove(); }

    function botReply(key) {
      showTyping();
      setTimeout(() => {
        removeTyping();
        const reply = resp[key] || resp.default[Math.floor(Math.random() * resp.default.length)];
        appendMsg(reply, false, msgs, false);
      }, 900 + Math.random() * 500);
    }

    function send(text, key) {
      if (!text.trim()) return;
      appendMsg(text, true, msgs, false);
      quickEl.style.display = 'none';
      botReply(key || 'default');
    }

    /* ── QUICK REPLIES ── */
    quickEl.querySelectorAll('.cbw-qbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.key;
        const label = btn.textContent;
        send(label, k);
      });
    });

    /* ── INPUT ── */
    sendBtn.addEventListener('click', () => { send(input.value); input.value = ''; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { send(input.value); input.value = ''; } });

    /* ── PUBLIC API ── */
    w.ClinicBridgeWidget = {
      open: openPanel,
      close: closePanel,
      sendMessage: (text) => send(text, 'default'),
      setLang: (l) => { cfg.lang = l; },
      // Hook for real backend integration:
      // onMessage: (fn) => { userMessageHandler = fn; }
    };
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})(window, document);
