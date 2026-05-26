/**
 * ClinicBridge One Widget v2.0
 * Injectable standalone assistant widget for clinic websites.
 * Usage: <script src="clinicbridge-widget.js" data-clinic-id="nova-dental" data-lang="en"></script>
 * Public API: window.ClinicBridgeWidget.open() / .close() / .sendMessage(text)
 */
(function (w, d) {
  'use strict';

  const script = d.currentScript || d.querySelector('script[data-clinic-id]');
  const cfg = {
    clinicId:      script?.dataset.clinicId || 'demo',
    lang:          script?.dataset.lang || 'en',
    apiBase:       script?.dataset.apiBase || 'https://clinicbridge-panel.vercel.app',
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

  /* ── DEFAULT FALLBACK QUICK ACTIONS (used when clinic has none configured) ── */
  const DEFAULT_QUICK_ACTIONS = {
    tr: [
      { emoji: '📅', labelTR: 'Randevu talebi oluştur',        labelEN: 'Create appointment request', actionType: 'appointment_request' },
      { emoji: '🦷', labelTR: 'Tedaviler hakkında bilgi al',   labelEN: 'Learn about treatments',      actionType: 'treatment_info' },
      { emoji: '💬', labelTR: 'Şikayetimi anlatmak istiyorum', labelEN: 'Describe my concern',         actionType: 'describe_complaint' },
    ],
  };

  const RESPONSES = {
    en: {
      book:      "Great! Let's get your appointment started. Could you tell me your full name and phone number so we can set it up? 📅",
      treatment: "Of course! We offer a range of treatments — from routine check-ups and teeth whitening to implants and smile design. Which area are you most interested in? 🦷",
      concern:   "I'm here to help. Please describe your concern or symptom in as much detail as you'd like — I'll do my best to guide you. 💬",
      clinic_services: "We offer a comprehensive range of dental services. Could you tell me more about what you're looking for?",
      pricing_info: "For accurate pricing, I'll need to understand your specific needs first. What treatment are you considering?",
      contact_request: "I'll connect you with our team right away.",
      default:   ["Happy to help! Could you share a bit more detail so I can assist you better? 😊", "That's a great question — let me look into that for you.", "I want to make sure I give you the right guidance. Could you tell me a bit more?"],
    },
    tr: {
      book:      "Harika! Randevunuzu oluşturmaya başlayalım. Ad ve soyadınızı ile telefon numaranızı paylaşabilir misiniz? 📅",
      treatment: "Tabii! Rutin diş kontrolünden implanta, diş beyazlatmadan gülüş tasarımına kadar geniş bir tedavi yelpazesi sunuyoruz. Hangi konuyla ilgileniyorsunuz? 🦷",
      concern:   "Dinliyorum. Şikayetinizi veya belirtinizi dilediğiniz gibi anlatabilirsiniz — size en doğru yönlendirmeyi yapmaya çalışacağım. 💬",
      clinic_services: "Kliniklerimizde sunulan hizmetler hakkında bilgi vermekten memnuniyet duyarım. Hangi tedaviyi merak ediyorsunuz?",
      pricing_info: "Doğru fiyat bilgisi için önce ihtiyacınızı anlamam gerekiyor. Hangi tedaviyi düşünüyorsunuz?",
      contact_request: "Sizi hemen ekibimize bağlayacağım.",
      default:   ["Yardımcı olmaktan memnuniyet duyarım! Biraz daha detay paylaşabilir misiniz? 😊", "Güzel bir soru — hemen bakıyorum.", "Size doğru bilgiyi verebilmek için biraz daha anlatır mısınız?"],
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
    #cbw-msgs{flex:1;overflow-y:auto;padding:16px 16px 20px;display:flex;flex-direction:column;gap:12px;min-height:180px;max-height:260px;scroll-behavior:smooth}
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

    const lang = cfg.lang in BUBBLES ? cfg.lang : 'tr';
    const resp = RESPONSES[lang];

    /* Build initial quick buttons from defaults — will be replaced after prefetch */
    function buildQuickButtons(actions, activeLang) {
      const active = actions
        .filter(a => a.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const isTr = activeLang === 'tr';
      return active.map(a =>
        `<button class="cbw-qbtn"
          data-type="${a.actionType}"
          data-label-tr="${(a.labelTR || '').replace(/"/g, '&quot;')}"
          data-label-en="${(a.labelEN || '').replace(/"/g, '&quot;')}"
        >${a.emoji || ''} ${isTr ? a.labelTR : a.labelEN}</button>`
      ).join('');
    }

    const initialActions = DEFAULT_QUICK_ACTIONS.tr;

    // Root
    const root = d.createElement('div');
    root.id = 'cbw-root';

    // Bubbles container
    const bubblesEl = d.createElement('div');
    bubblesEl.id = 'cbw-bubbles';
    root.appendChild(bubblesEl);

    // Panel
    root.innerHTML += `
      <div id="cbw-panel" role="dialog" aria-label="ClinicBridge One Assistant" aria-hidden="true">
        <div id="cbw-head">
          <div class="cbw-hleft">
            <div class="cbw-avatar">${AVATAR_SVG}</div>
            <div>
              <span class="cbw-hname">ClinicBridge One Assistant</span>
              <div class="cbw-hstatus"><span class="cbw-sdot"></span>Online</div>
            </div>
          </div>
          <button id="cbw-close" aria-label="Close assistant">${CLOSE_SVG}</button>
        </div>
        <div id="cbw-msgs"></div>
        <div id="cbw-quick">
          ${buildQuickButtons(initialActions, lang)}
        </div>
        <div id="cbw-inputrow">
          <input id="cbw-input" type="text" placeholder="Type your message…" autocomplete="off"/>
          <button id="cbw-send" aria-label="Send">${SEND_SVG}</button>
        </div>
      </div>
      <button id="cbw-launcher" aria-label="Open ClinicBridge One Assistant">
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

    /* ── LIVE SUPPORT BUTTONS ── */
    function normalizePhone(num) {
      return (num || '').replace(/[^0-9]/g, '');
    }

    function buildWhatsAppUrl(waNum, ctx) {
      const phone = normalizePhone(waNum);
      if (!phone) return '';

      const lang    = ctx.lang || cfg.lang || 'en';
      const clinic  = ctx.clinicName || 'Klinik';
      const patient = ctx.patientName || (lang === 'tr' ? 'Anonim Ziyaretçi' : 'Anonymous Visitor');
      const topic   = ctx.lastUserMsg || '';
      const convId  = ctx.convId || '';

      let msgText;
      if (lang === 'tr') {
        msgText =
          `Merhaba, ${clinic} web sitesi üzerinden destek almak istiyorum.\n\n` +
          `Hasta: ${patient}\n` +
          (topic ? `Konu: ${topic}\n` : '') +
          `Dil: TR\n` +
          (convId ? `Görüşme ID: ${convId}` : '');
      } else {
        msgText =
          `Hello, I need support from ${clinic}.\n\n` +
          `Patient: ${patient}\n` +
          (topic ? `Topic: ${topic}\n` : '') +
          `Language: EN\n` +
          (convId ? `Conversation ID: ${convId}` : '');
      }
      return `https://wa.me/${phone}?text=${encodeURIComponent(msgText.trim())}`;
    }

    function appendLiveSupportButtons(waNum, tgLink, ctx) {
      const hasWa = !!waNum;
      const hasTg = !!tgLink;
      if (!hasWa && !hasTg) return;

      const waHref = waNum ? buildWhatsAppUrl(waNum, ctx) : '';
      const tgHref = tgLink || '';
      const convId = ctx.convId || '';

      const wrapper = d.createElement('div');
      wrapper.className = 'cbw-msg cbw-bot';
      wrapper.style.cssText = 'margin-top:4px';

      const btnWrap = d.createElement('div');
      btnWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:4px 0';

      if (hasWa) {
        const btn = d.createElement('a');
        btn.href = waHref;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.style.cssText = [
          'display:inline-flex;align-items:center;gap:8px',
          'padding:10px 16px;border-radius:10px',
          'background:#25D366;color:#fff',
          'font-size:13.5px;font-weight:600;text-decoration:none',
          'cursor:pointer;transition:opacity .2s;font-family:inherit',
          'border:none;width:fit-content'
        ].join(';');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
        btn.innerHTML += ' WhatsApp ile İletişime Geç';
        btn.addEventListener('click', () => logChannelClick('whatsapp', convId, ctx));
        btn.addEventListener('mouseover', () => btn.style.opacity = '0.88');
        btn.addEventListener('mouseout', () => btn.style.opacity = '1');
        btnWrap.appendChild(btn);
      }

      if (hasTg) {
        const btn = d.createElement('a');
        btn.href = tgHref;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.style.cssText = [
          'display:inline-flex;align-items:center;gap:8px',
          'padding:10px 16px;border-radius:10px',
          'background:#26A5E4;color:#fff',
          'font-size:13.5px;font-weight:600;text-decoration:none',
          'cursor:pointer;transition:opacity .2s;font-family:inherit',
          'border:none;width:fit-content'
        ].join(';');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`;
        btn.innerHTML += ' Telegram ile İletişime Geç';
        btn.addEventListener('click', () => logChannelClick('telegram', convId, ctx));
        btn.addEventListener('mouseover', () => btn.style.opacity = '0.88');
        btn.addEventListener('mouseout', () => btn.style.opacity = '1');
        btnWrap.appendChild(btn);
      }

      wrapper.appendChild(btnWrap);
      msgs.appendChild(wrapper);
      msgs.scrollTop = msgs.scrollHeight;
    }

    /* ── LOG CHANNEL CLICK ── */
    function logChannelClick(channel, convId, ctx) {
      if (!convId) return;
      try {
        fetch(`${cfg.apiBase}/api/public/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinicId: cfg.clinicId,
            message: `[SYS:channel_click:${channel}]`,
            conversationId: convId,
            history: [],
            _systemAction: {
              type:        'liveSupportChannelClick',
              channel,
              patientName: (ctx && ctx.patientName) || null,
              lastUserMsg: (ctx && ctx.lastUserMsg) || null,
              lang:        (ctx && ctx.lang) || cfg.lang,
            },
          }),
        }).catch(() => {});
      } catch(e) {}
    }


    /* ── CONVERSATION STATE ── */
    let conversationHistory = [];
    let currentConvId = '';
    let pendingApptData = null;
    let liveSupportShown = false;
    let surveyShown = false;

    /** Shared context — updated on every API response and prefetch */
    const clinicCtx = {
      clinicName:  '',
      patientName: '',
      lastUserMsg: '',
      lang:        cfg.lang,
      convId:      '',
      whatsapp:    '',
      telegram:    '',
      aiSkills:    /** @type {Record<string,boolean>} */ ({}),
    };

    /* ── PREFETCH CLINIC CONFIG ── */
    fetch(`${cfg.apiBase}/api/public/clinic-config?clinicId=${encodeURIComponent(cfg.clinicId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.clinicName)     clinicCtx.clinicName = data.clinicName;
        if (data.whatsappNumber) clinicCtx.whatsapp   = data.whatsappNumber;
        if (data.telegramLink)   clinicCtx.telegram   = data.telegramLink;
        if (data.clinicLanguage && !cfg.lang) clinicCtx.lang = data.clinicLanguage;
        if (data.aiSkills)       clinicCtx.aiSkills   = data.aiSkills;

        // Re-render quick action buttons from Firestore config
        const configuredActions = (data.quickActions || []).filter(a => a.isActive !== false);
        if (configuredActions.length > 0 && quickEl) {
          quickEl.innerHTML = buildQuickButtons(configuredActions, clinicCtx.lang || lang);
          attachQuickBtnListeners();
          console.log('[ClinicBridge Widget] Quick actions loaded from config:', configuredActions.length);
        }

        console.group('[ClinicBridge Widget] Clinic config loaded');
        console.log('Clinic:', clinicCtx.clinicName);
        console.log('WhatsApp:', clinicCtx.whatsapp || '(not set)');
        console.log('Telegram:', clinicCtx.telegram || '(not set)');
        console.log('Language:', clinicCtx.lang);
        console.log('AI Skills:', data.aiSkills);
        console.log('Quick Actions:', configuredActions.length > 0 ? configuredActions.map(a => a.labelTR).join(', ') : '(using defaults)');
        console.groupEnd();
      })
      .catch(() => {});


    /* ── SKILL HELPER ── */
    function skillEnabled(id) {
      // Default ON if not explicitly set to false
      return clinicCtx.aiSkills[id] !== false;
    }

    /* ── CLOSING INTENT DETECTION ── */
    const CLOSING_TR = [
      'teşekkür ederim', 'teşekkürler', 'tesekkur ederim', 'tesekkurler',
      'sağ olun', 'sag olun', 'eyvallah', 'tamamdır', 'tamam teşekkür',
      'başka sorum yok', 'başka bir şeyim yok', 'yardımcı oldunuz',
      'anladım teşekkür', 'iyi günler', 'güle güle', 'görüşürüz',
    ];
    const CLOSING_EN = [
      'thank you', 'thanks', 'thank you so much', 'many thanks',
      'that\'s all', 'no more questions', 'i\'m good', 'got it thanks',
      'all good', 'perfect thanks', 'great thanks', 'goodbye', 'bye',
    ];
    function isClosingIntent(text) {
      const t = text.toLowerCase().trim();
      return CLOSING_TR.some(k => t.includes(k)) || CLOSING_EN.some(k => t.includes(k));
    }

    /* ── SURVEY CARD ── */
    function appendSurveyCard(lang, convId) {
      const isTr = lang === 'tr';
      const prompt = isTr
        ? 'Sizi yeterince yardımcı olabildik mi? Deneyiminizi değerlendirmek ister misiniz?'
        : 'Would you like to rate your experience with us today?';
      const labels = isTr
        ? ['Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel']
        : ['Very Bad', 'Bad', 'OK', 'Good', 'Excellent'];
      const submitLabel = isTr ? 'Değerlendir' : 'Submit';
      const thankLabel  = isTr ? 'Teşekkürler! Geri bildiriminiz alındı. 🙏' : 'Thank you for your feedback! 🙏';

      const wrapper = d.createElement('div');
      wrapper.className = 'cbw-msg cbw-bot';

      const card = d.createElement('div');
      card.style.cssText = [
        'background:#F8FAFC;border:1px solid #E2E8F0',
        'border-radius:16px;padding:16px 18px;margin-top:4px',
        'display:flex;flex-direction:column;gap:12px',
        'max-width:92%',
      ].join(';');

      // Prompt
      const promptEl = d.createElement('p');
      promptEl.style.cssText = 'font-size:13.5px;color:#334155;line-height:1.55;margin:0';
      promptEl.textContent = prompt;
      card.appendChild(promptEl);

      // Stars row
      const starsRow = d.createElement('div');
      starsRow.style.cssText = 'display:flex;gap:6px;align-items:center';
      let selectedRating = 0;
      const starBtns = [];

      function updateStars(hovered) {
        starBtns.forEach((btn, i) => {
          const active = i < (hovered || selectedRating);
          btn.style.color  = active ? '#F59E0B' : '#CBD5E1';
          btn.style.filter = active ? 'drop-shadow(0 0 3px rgba(245,158,11,0.4))' : 'none';
        });
      }

      for (let i = 1; i <= 5; i++) {
        const btn = d.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', labels[i - 1]);
        btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:26px;padding:2px;transition:transform 0.15s;color:#CBD5E1';
        btn.textContent = '★';
        const idx = i;
        btn.addEventListener('click',      () => { selectedRating = idx; updateStars(0); });
        btn.addEventListener('mouseenter', () => updateStars(idx));
        btn.addEventListener('mouseleave', () => updateStars(0));
        btn.addEventListener('mousedown',  () => { btn.style.transform = 'scale(1.3)'; });
        btn.addEventListener('mouseup',    () => { btn.style.transform = 'scale(1)'; });
        starsRow.appendChild(btn);
        starBtns.push(btn);
      }
      card.appendChild(starsRow);

      // Submit button
      const submitBtn = d.createElement('button');
      submitBtn.type = 'button';
      submitBtn.textContent = submitLabel;
      submitBtn.style.cssText = [
        'align-self:flex-start;padding:8px 20px',
        'border-radius:10px;border:none;cursor:pointer',
        'background:#6366F1;color:#fff',
        'font-size:13px;font-weight:600;font-family:inherit',
        'transition:opacity 0.2s',
      ].join(';');
      submitBtn.addEventListener('mouseenter', () => submitBtn.style.opacity = '0.85');
      submitBtn.addEventListener('mouseleave', () => submitBtn.style.opacity = '1');
      submitBtn.addEventListener('click', () => {
        if (!selectedRating) return;
        // Replace card content with thank-you
        card.innerHTML = `<p style="font-size:13.5px;color:#10b981;font-weight:600;margin:0">${thankLabel}</p>`;
        logSurveyEvent('satisfaction_survey_submitted', selectedRating, convId);
        console.log('[ClinicBridge Widget] Survey submitted — rating:', selectedRating);
      });
      card.appendChild(submitBtn);

      wrapper.appendChild(card);
      msgs.appendChild(wrapper);
      msgs.scrollTop = msgs.scrollHeight;

      console.log('[ClinicBridge Widget] Triggered action: satisfaction_survey_displayed');
      logSurveyEvent('satisfaction_survey_displayed', 0, convId);
    }

    /* ── LOG SURVEY EVENT ── */
    function logSurveyEvent(action, rating, convId) {
      if (!convId) return;
      try {
        fetch(`${cfg.apiBase}/api/public/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinicId: cfg.clinicId,
            message: `[SYS:${action}]`,
            conversationId: convId,
            history: [],
            _systemAction: { type: action, rating: rating || undefined },
          }),
        }).catch(() => {});
      } catch(e) {}
    }

    /* ── LANGUAGE DETECTION (from actual message, not cfg.lang) ── */
    function detectLang(text) {
      if (/[\u011f\u00fc\u015f\u0131\u00f6\u00e7\u011e\u00dc\u015e\u0130\u00d6\u00c7]/.test(text)) return 'tr';
      if (/\b(istiyorum|misin|m[iı]s[iı]n[iı]z|lütfen|te[sş]ekkür|merhaba|tamam|evet|hay[iı]r|ba[gğ]la|destek|görü[sş]mek|ileti[sş]im|biri|birine|biriyle|aras[iı]n|arayabilir|klinik|sizi|beni)\b/i.test(text)) return 'tr';
      return cfg.lang || 'tr';
    }

    /* ── LIVE SUPPORT INTENT DETECTION ── */
    const LIVE_INTENT_TR = [
      'canlı destek', 'canli destek',
      'canlı birine', 'canli birine',
      'canlı biriyle', 'canli biriyle',
      'insana bağla', 'insana bagla',
      'insan ile', 'gerçek kişi', 'gercek kisi',
      'biriyle görüşmek', 'biriyle gorusmek',
      'biri beni arasın', 'biri beni arasin',
      'sizi arayabilir', 'telefon',
      'klinikle görüşmek', 'klinikle iletişime',
      'sizinle görüşmek', 'ekiple görüşmek',
      'yetkili', 'müşteri temsilci',
      'operatöre bağla',
      'whatsapp', 'telegram',
    ];
    const LIVE_INTENT_EN = [
      'live support', 'live chat', 'real person', 'human agent',
      'talk to someone', 'speak to someone', 'connect me',
      'contact the clinic', 'phone call', 'call me',
      'whatsapp', 'telegram',
    ];
    function isLiveSupportIntent(text) {
      const t = text.toLowerCase();
      return LIVE_INTENT_TR.some(k => t.includes(k)) || LIVE_INTENT_EN.some(k => t.includes(k));
    }

    /* ── HANDOFF ── */
    function showHandoff(text) {
      const msgLang = detectLang(text);
      clinicCtx.lang = msgLang;
      clinicCtx.lastUserMsg = text;

      const name = clinicCtx.clinicName || 'Nova Dental Clinic';
      const handoffMsg = msgLang === 'tr'
        ? `Sizi canlı destek ekibimize yönlendirebilirim. Aşağıdaki kanallardan biriyle ${name} ekibine ulaşabilirsiniz.`
        : `I can direct you to our live support team. You can contact ${name} through one of the channels below.`;

      appendMsg(handoffMsg, false, msgs, false);
      conversationHistory.push({ role: 'assistant', content: handoffMsg });
      appendLiveSupportButtons(clinicCtx.whatsapp, clinicCtx.telegram, { ...clinicCtx });
      liveSupportShown = true;

      // Background log
      const convId = currentConvId || `session_${Date.now()}`;
      if (!currentConvId) currentConvId = convId;
      clinicCtx.convId = convId;
      fetch(`${cfg.apiBase}/api/public/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: cfg.clinicId,
          message: text,
          history: conversationHistory.slice(-12),
          conversationId: convId,
          _systemAction: { type: 'liveSupportHandoffDisplayed', lang: msgLang },
        }),
      }).catch(() => {});
    }

    /* ── API CALL ── */
    async function callApi(userText) {
      const payload = {
        clinicId: cfg.clinicId,
        message: userText,
        history: conversationHistory.slice(-14),
        conversationId: currentConvId || undefined,
        pendingAppointmentData: pendingApptData || undefined,
      };
      const res = await fetch(`${cfg.apiBase}/api/public/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return res.json();
    }

    async function send(text, key) {
      if (!text.trim()) return;
      appendMsg(text, true, msgs, false);
      conversationHistory.push({ role: 'user', content: text });
      quickEl.style.display = 'none';

      /* ── CLIENT-SIDE LIVE SUPPORT SHORT-CIRCUIT ── */
      const intentDetected = isLiveSupportIntent(text);
      console.log(`[ClinicBridge Widget] Message: "${text.slice(0,60)}"`);
      console.log(`[ClinicBridge Widget] Intent: ${intentDetected ? '🚨 LIVE_SUPPORT_DETECTED' : '✅ normal'} | Lang: ${detectLang(text)}`);

      if (intentDetected) {
        console.log('[ClinicBridge Widget] Action: showHandoff → short-circuiting API call');
        showHandoff(text);
        return;
      }

      /* ── EMERGENCY DETECTION ── */
      const EMERGENCY_TR = [
        'çok şiddetli ağrı', 'dayanılmaz ağrı', 'kanıyor', 'kan geliyor',
        'nefes alamıyorum', 'nefes darlığı', 'bayılıyorum', 'bayıldım',
        'çene kilitlendi', 'yüzüm şişti', 'şiddetli şişlik',
        'acil', 'ambulans', '112', 'çok kötüyüm', 'hastaneye',
        'diş düştü', 'diş kırıldı çok', 'ateşim var şişlik',
      ];
      const EMERGENCY_EN = [
        'severe pain', 'unbearable pain', 'bleeding heavily', 'can\'t breathe',
        'facial swelling', 'jaw locked', 'passed out', 'fainted',
        'emergency', 'ambulance', 'tooth fell out', 'very bad swelling',
        'can\'t open mouth', 'swelling spreading',
      ];
      function isEmergencyIntent(t) {
        const lower = t.toLowerCase();
        return EMERGENCY_TR.some(k => lower.includes(k)) || EMERGENCY_EN.some(k => lower.includes(k));
      }

      if (isEmergencyIntent(text)) {
        const msgLang = detectLang(text);
        const name = clinicCtx.clinicName || 'Nova Dental Clinic';
        console.log('[ClinicBridge Widget] Intent: 🚨 EMERGENCY_DETECTED');
        const emergencyMsg = msgLang === 'tr'
          ? `Bu durum acil değerlendirme gerektirebilir. Lütfen vakit kaybetmeden kliniğinizle veya en yakın sağlık kuruluşuyla iletişime geçin. Dilerseniz sizi WhatsApp üzerinden ${name} ekibine yönlendirebilirim.`
          : `This may require urgent evaluation. Please contact the clinic or the nearest healthcare provider as soon as possible. If you wish, I can direct you to the ${name} team via WhatsApp.`;
        appendMsg(emergencyMsg, false, msgs, false);
        conversationHistory.push({ role: 'assistant', content: emergencyMsg });
        appendLiveSupportButtons(clinicCtx.whatsapp, clinicCtx.telegram, { ...clinicCtx, lastUserMsg: text, lang: msgLang });
        liveSupportShown = true;
        return;
      }

      /* ── NORMAL API CALL ── */
      showTyping();
      try {
        const data = await callApi(text);
        removeTyping();

        console.log('[ClinicBridge Widget] API response:', {
          conversationId: data.conversationId,
          liveSupportRequired: data.liveSupportRequired,
          hasWhatsapp: !!data.whatsappNumber,
          hasTelegram: !!data.telegramLink,
          replyPreview: (data.reply || '').slice(0,60),
        });

        if (data.conversationId) { currentConvId = data.conversationId; clinicCtx.convId = data.conversationId; }
        if (data.pendingAppointmentData) pendingApptData = data.pendingAppointmentData;
        if (data.clinicName)       clinicCtx.clinicName = data.clinicName;
        if (data.detectedLanguage) clinicCtx.lang       = data.detectedLanguage;
        if (data.whatsappNumber)   clinicCtx.whatsapp   = data.whatsappNumber;
        if (data.telegramLink)     clinicCtx.telegram   = data.telegramLink;
        if (data.pendingAppointmentData?.patientName) clinicCtx.patientName = data.pendingAppointmentData.patientName;

        // If API also signals live support (e.g. from AI reply), show handoff
        if (data.liveSupportRequired && !liveSupportShown) {
          console.log('[ClinicBridge Widget] Action: API-triggered live support handoff');
          const replyText = data.reply || '';
          if (replyText) appendMsg(replyText, false, msgs, false);
          appendLiveSupportButtons(
            data.whatsappNumber || clinicCtx.whatsapp,
            data.telegramLink   || clinicCtx.telegram,
            { ...clinicCtx, lastUserMsg: text }
          );
          liveSupportShown = true;
          return;
        }

        const replyText = data.reply || '';
        if (replyText) {
          appendMsg(replyText, false, msgs, false);
          conversationHistory.push({ role: 'assistant', content: replyText });
        }
        liveSupportShown = false;

        /* ── POST-REPLY: check survey trigger ── */
        const surveyEnabled     = skillEnabled('send_patient_satisfaction_survey');
        const enoughExchanges   = conversationHistory.length >= 4; // ≥2 user + 2 assistant turns
        const closingMsg        = isClosingIntent(text);
        console.log('[ClinicBridge Widget] Survey check:', {
          skillEnabled: surveyEnabled, enoughExchanges, isClosingIntent: closingMsg, surveyShown
        });
        if (surveyEnabled && enoughExchanges && closingMsg && !surveyShown && !liveSupportShown) {
          console.log('[ClinicBridge Widget] Detected intent: conversation_closing');
          console.log('[ClinicBridge Widget] Matched capability: Hasta Memnuniyet Anketi');
          const survLang = detectLang(text);
          const survConvId = data.conversationId || currentConvId || `session_${Date.now()}`;
          if (!currentConvId) { currentConvId = survConvId; clinicCtx.convId = survConvId; }
          surveyShown = true;
          setTimeout(() => appendSurveyCard(survLang, survConvId), 400);
        }
      } catch (err) {
        removeTyping();
        console.warn('[cbw] API error, using local fallback:', err.message);
        const reply = resp[key] || resp.default[Math.floor(Math.random() * resp.default.length)];
        appendMsg(reply, false, msgs, false);
        conversationHistory.push({ role: 'assistant', content: reply });
      }
    }


    /* ── QUICK REPLIES ── */
    const ACTION_PROMPTS = {
      appointment_request: { tr: 'Randevu talebi oluşturmak istiyorum.', en: 'I would like to create an appointment request.' },
      treatment_info:      { tr: 'Tedaviler hakkında bilgi almak istiyorum.', en: 'I would like to learn about your treatments.' },
      describe_complaint:  { tr: 'Şikayetimi anlatmak istiyorum.', en: 'I would like to describe my concern.' },
      clinic_services:     { tr: 'Klinik hizmetleriniz neler?', en: 'What services does the clinic offer?' },
      pricing_info:        { tr: 'Tedavi fiyatları hakkında bilgi alabilir miyim?', en: 'Can I get information about treatment pricing?' },
      contact_request:     { tr: 'Bir yetkiliyle görüşmek istiyorum.', en: 'I would like to speak with someone.' },
    };

    function attachQuickBtnListeners() {
      quickEl.querySelectorAll('.cbw-qbtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const actionType = btn.dataset.type;
          const activeLang = detectLang ? detectLang('') : (clinicCtx.lang || lang);
          const isTr = activeLang === 'tr';
          const labelTR = btn.dataset.labelTr || btn.textContent.trim();
          const labelEN = btn.dataset.labelEn || btn.textContent.trim();
          const displayLabel = isTr ? labelTR : labelEN;

          console.log(`[ClinicBridge Widget] Quick action clicked: ${actionType} | "${displayLabel}"`);

          // Log analytics
          const logConvId = currentConvId || `session_${Date.now()}`;
          fetch(`${cfg.apiBase}/api/public/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clinicId: cfg.clinicId,
              conversationId: logConvId,
              message: `[SYS:quick_action_clicked]`,
              history: [],
              _systemAction: { type: 'quick_action_clicked', actionType, label: displayLabel },
            }),
          }).catch(() => {});

          // contact_request → immediate handoff, no API
          if (actionType === 'contact_request') {
            showHandoff(displayLabel);
            return;
          }

          // custom_prompt → use the label text directly
          if (actionType === 'custom_prompt') {
            send(displayLabel, 'default');
            return;
          }

          // All other types → resolved prompt text
          const prompts = ACTION_PROMPTS[actionType];
          const msgText = prompts
            ? (isTr ? prompts.tr : prompts.en)
            : displayLabel;
          send(msgText, actionType);
        });
      });
    }

    attachQuickBtnListeners();

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
