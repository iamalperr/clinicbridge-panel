/**
 * ClinicBridge AI Widget v3.0 — Dynamic Settings
 * Served at: https://widget.clinicbridge-ai.com/widget.js
 *
 * Usage:
 *   <script src="https://widget.clinicbridge-ai.com/widget.js"
 *           data-clinic-id="YOUR_CLINIC_ID"></script>
 */
(function (w, d) {
  'use strict';

  if (w.__cbwLoaded) return;
  w.__cbwLoaded = true;

  const scriptEl = d.currentScript || d.querySelector('script[data-clinic-id]');
  const clinicId = scriptEl?.dataset.clinicId || 'demo';
  const API_BASE = 'https://app.clinicbridge-ai.com';

  /* ── Fetch clinic settings from panel API ── */
  function fetchSettings() {
    const url = API_BASE + '/api/public/widget-settings/' + clinicId + '?t=' + Date.now();
    return fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });
  }

  /* ── DEFAULTS (used if API unavailable) ── */
  var DEFAULTS = {
    title: 'Clinic Assistant',
    welcomeMessage: 'Merhaba! Size nasıl yardımcı olabilirim?',
    placeholder: 'Bir mesaj yazın...',
    primaryColor: '#6366f1',
    position: 'bottom-right',
    showAvatar: true,
    showOnlineStatus: true,
    showBubbles: {
      enabled: true,
      displayMode: 'rotate',
      messages: {
        tr: ['Hangi tedavinin size uygun olduğunu merak mı ediyorsunuz?', 'Randevu almak ister misiniz?'],
        en: ['Need help choosing a treatment?', 'Want to book an appointment?'],
      },
      timing: { initialDelaySeconds: 3, rotationIntervalSeconds: 6 },
      behavior: { hideAfterOpen: true, showOncePerSession: false, disableOnMobile: false },
    },
  };

  /* ── Derive position CSS ── */
  function positionStyles(position) {
    if (position === 'bottom-left') {
      return 'bottom:28px;left:28px;right:auto;align-items:flex-start;';
    }
    return 'bottom:28px;right:28px;left:auto;align-items:flex-end;';
  }

  function panelSide(position) {
    return position === 'bottom-left' ? 'left:0;right:auto;' : 'right:0;left:auto;';
  }

  /* ── Build & inject widget with resolved settings ── */
  function buildWidget(cfg) {
    var s = Object.assign({}, DEFAULTS, cfg);
    var sb = Object.assign({}, DEFAULTS.showBubbles, s.showBubbles);
    var sbMsg = Object.assign({}, DEFAULTS.showBubbles.messages, sb.messages);
    var sbTiming = Object.assign({}, DEFAULTS.showBubbles.timing, sb.timing);
    var sbBeh = Object.assign({}, DEFAULTS.showBubbles.behavior, sb.behavior);

    var lang = (navigator.language || 'en').slice(0, 2);
    if (!sbMsg[lang]) lang = 'en';

    var c = s.primaryColor;
    var cDark = c; // use same color, darken via opacity in CSS

    /* ── CSS ── */
    var pos = positionStyles(s.position);
    var pSide = panelSide(s.position);

    var CSS = [
      '#cbw-root{position:fixed;' + pos + 'z-index:2147483640;display:flex;flex-direction:column;gap:10px;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif}',
      '#cbw-launcher{width:60px;height:60px;border-radius:18px;border:none;cursor:pointer;background:' + c + ';box-shadow:0 8px 28px ' + c + '70;display:flex;align-items:center;justify-content:center;position:relative;transition:transform .25s,box-shadow .25s;flex-shrink:0;outline:none}',
      '#cbw-launcher:hover{transform:scale(1.08) translateY(-2px)}',
      '#cbw-online{position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;background:#22C55E;border:2.5px solid #fff;' + (s.showOnlineStatus ? '' : 'display:none;') + 'animation:cbw-ping 2.5s infinite}',
      '@keyframes cbw-ping{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}60%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}',
      '#cbw-bubbles{display:flex;flex-direction:column;gap:8px}',
      '.cbw-bubble{background:#fff;border:1px solid ' + c + '25;border-radius:20px 20px 4px 20px;padding:10px 14px;font-size:13.5px;color:#1e293b;box-shadow:0 4px 18px rgba(0,0,0,.11);display:flex;align-items:center;gap:9px;max-width:236px;line-height:1.4;cursor:pointer;transition:box-shadow .2s,transform .2s;animation:cbw-bubble-in .35s cubic-bezier(.34,1.56,.64,1)}',
      '.cbw-bubble:hover{box-shadow:0 6px 22px rgba(0,0,0,.15);transform:translateX(-3px)}',
      '.cbw-bdot{width:8px;height:8px;border-radius:50%;background:' + c + ';flex-shrink:0}',
      '.cbw-bx{margin-left:auto;color:#94A3B8;font-size:14px;flex-shrink:0}',
      '@keyframes cbw-bubble-in{from{opacity:0;transform:translateY(10px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}',
      '#cbw-panel{position:absolute;bottom:74px;' + pSide + 'width:360px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05);overflow:hidden;display:flex;flex-direction:column;transform:scale(.88) translateY(24px);transform-origin:bottom ' + (s.position === 'bottom-left' ? 'left' : 'right') + ';opacity:0;pointer-events:none;transition:all .32s cubic-bezier(.34,1.56,.64,1)}',
      '#cbw-panel.cbw-open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}',
      '#cbw-head{background:' + c + ';padding:17px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}',
      '.cbw-hleft{display:flex;align-items:center;gap:12px}',
      '.cbw-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;' + (s.showAvatar ? '' : 'display:none;') + '}',
      '.cbw-hname{display:block;font-size:13.5px;font-weight:700;color:#fff}',
      '.cbw-hstatus{display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.8);margin-top:2px;' + (s.showOnlineStatus ? '' : 'display:none;') + '}',
      '.cbw-sdot{width:7px;height:7px;border-radius:50%;background:#86EFAC;display:inline-block}',
      '#cbw-close{background:rgba(255,255,255,.18);border:none;border-radius:8px;cursor:pointer;padding:7px;display:flex;transition:background .2s;color:#fff}',
      '#cbw-close:hover{background:rgba(255,255,255,.3)}',
      '#cbw-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:180px;max-height:260px;scroll-behavior:smooth}',
      '.cbw-msg{display:flex;flex-direction:column;gap:3px}',
      '.cbw-bubble-msg{padding:11px 15px;font-size:14px;line-height:1.65;max-width:86%;color:#1e293b}',
      '.cbw-bot .cbw-bubble-msg{background:#F1F5F9;border-radius:4px 16px 16px 16px}',
      '.cbw-user{align-items:flex-end}',
      '.cbw-user .cbw-bubble-msg{background:' + c + ';color:#fff;border-radius:16px 4px 16px 16px}',
      '.cbw-ts{font-size:11px;color:#94A3B8;padding:0 4px}',
      '.cbw-user .cbw-ts{text-align:right}',
      '.cbw-typing .cbw-bubble-msg{display:flex;gap:5px;align-items:center;padding:14px 18px}',
      '.cbw-tdot{width:8px;height:8px;border-radius:50%;background:#94A3B8;animation:cbw-bounce .8s infinite}',
      '.cbw-tdot:nth-child(2){animation-delay:.15s}.cbw-tdot:nth-child(3){animation-delay:.3s}',
      '@keyframes cbw-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',
      '#cbw-quick{padding:10px 14px;display:flex;flex-direction:column;gap:7px;border-top:1px solid #E2E8F0;flex-shrink:0}',
      '.cbw-qbtn{background:' + c + '18;border:1.5px solid ' + c + '30;border-radius:10px;padding:9px 13px;font-size:13px;font-weight:500;color:' + c + ';cursor:pointer;text-align:left;transition:all .2s;font-family:inherit}',
      '.cbw-qbtn:hover{background:' + c + '30}',
      '#cbw-inputrow{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid #E2E8F0;flex-shrink:0}',
      '#cbw-input{flex:1;border:1.5px solid #E2E8F0;border-radius:10px;padding:10px 14px;font-size:14px;font-family:inherit;outline:none;transition:border-color .2s;color:#1e293b;background:#fff}',
      '#cbw-input:focus{border-color:' + c + ';box-shadow:0 0 0 3px ' + c + '20}',
      '#cbw-send{width:38px;height:38px;border-radius:10px;border:none;cursor:pointer;background:' + c + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .2s}',
      '#cbw-send:hover{transform:scale(1.08)}',
      '#cbw-powered{text-align:center;font-size:11px;color:#94A3B8;padding:6px 14px 10px;border-top:1px solid #F1F5F9}',
      '#cbw-powered a{color:' + c + ';text-decoration:none;font-weight:600}',
      '@media(max-width:480px){#cbw-panel{width:calc(100vw - 32px);' + (s.position === 'bottom-left' ? 'left:4px' : 'right:-4px') + '}}',
    ].join('');

    var ICON = '<svg width="30" height="30" viewBox="0 0 30 30" fill="none"><path d="M15 3.5C12 3.5 9.5 5.8 9 8.8C8.4 6.2 6.4 4.5 5 4.5C5 4.5 6 10 8 13C9.3 15.2 10 18 10 21C10 23.5 11 26 12.8 26C14 26 14.8 24.8 15 22.8C15.2 24.8 16 26 17.2 26C19 26 20 23.5 20 21C20 18 20.7 15.2 22 13C24 10 25 4.5 25 4.5C23.6 4.5 21.6 6.2 21 8.8C20.5 5.8 18 3.5 15 3.5Z" fill="white" opacity="0.93"/><path d="M23 6L23.6 7.8L25.4 8.4L23.6 9L23 10.8L22.4 9L20.6 8.4L22.4 7.8L23 6Z" fill="white"/></svg>';
    var AVT  = '<svg width="22" height="22" viewBox="0 0 30 30" fill="none"><path d="M15 3.5C12 3.5 9.5 5.8 9 8.8C8.4 6.2 6.4 4.5 5 4.5C5 4.5 6 10 8 13C9.3 15.2 10 18 10 21C10 23.5 11 26 12.8 26C14 26 14.8 24.8 15 22.8C15.2 24.8 16 26 17.2 26C19 26 20 23.5 20 21C20 18 20.7 15.2 22 13C24 10 25 4.5 25 4.5C23.6 4.5 21.6 6.2 21 8.8C20.5 5.8 18 3.5 15 3.5Z" fill="white" opacity="0.9"/></svg>';
    var CLO  = '<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>';
    var SND  = '<svg width="17" height="17" fill="none" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* ── inject style ── */
    var style = d.createElement('style');
    style.textContent = CSS;
    d.head.appendChild(style);

    /* ── build DOM ── */
    var root = d.createElement('div');
    root.id = 'cbw-root';

    var bubblesEl = d.createElement('div');
    bubblesEl.id = 'cbw-bubbles';
    root.appendChild(bubblesEl);

    root.innerHTML += [
      '<div id="cbw-panel" role="dialog" aria-hidden="true">',
        '<div id="cbw-head">',
          '<div class="cbw-hleft">',
            '<div class="cbw-avatar">' + AVT + '</div>',
            '<div>',
              '<span class="cbw-hname">' + escHtml(s.title) + '</span>',
              '<div class="cbw-hstatus"><span class="cbw-sdot"></span>Online</div>',
            '</div>',
          '</div>',
          '<button id="cbw-close" aria-label="Close">' + CLO + '</button>',
        '</div>',
        '<div id="cbw-msgs"></div>',
        '<div id="cbw-quick"></div>',
        '<div id="cbw-inputrow">',
          '<input id="cbw-input" type="text" placeholder="' + escAttr(s.placeholder) + '" autocomplete="off"/>',
          '<button id="cbw-send" aria-label="Send">' + SND + '</button>',
        '</div>',
        '<div id="cbw-powered">Powered by <a href="https://clinicbridge-ai.com" target="_blank" rel="noopener">ClinicBridge AI</a></div>',
      '</div>',
      '<button id="cbw-launcher" aria-label="Open ClinicBridge AI">',
        ICON,
        '<span id="cbw-online"></span>',
      '</button>',
    ].join('');

    d.body.appendChild(root);

    var panel    = d.getElementById('cbw-panel');
    var launcher = d.getElementById('cbw-launcher');
    var closeBtn = d.getElementById('cbw-close');
    var msgs     = d.getElementById('cbw-msgs');
    var input    = d.getElementById('cbw-input');
    var sendBtn  = d.getElementById('cbw-send');
    var quickEl  = d.getElementById('cbw-quick');

    /* ── quick buttons ── */
    var quickItems = [
      { label: lang === 'tr' ? '📅 Randevu almak istiyorum' : '📅 Book an appointment', key: 'book' },
      { label: lang === 'tr' ? '🏥 Hizmetleriniz neler?'   : '🏥 What services do you offer?', key: 'services' },
      { label: lang === 'tr' ? '💬 WhatsApp ile iletişim'  : '💬 Contact on WhatsApp', key: 'whatsapp' },
    ];
    quickEl.innerHTML = quickItems.map(function(q) {
      return '<button class="cbw-qbtn" data-key="' + q.key + '">' + q.label + '</button>';
    }).join('');

    var BOT_REPLIES = {
      book:     lang === 'tr' ? 'Randevu için iletişim formumuzu doldurabilir veya kliniğimizi arayabilirsiniz. 📅' : 'Please fill in our contact form or call us to book. 📅',
      services: lang === 'tr' ? 'Geniş bir tedavi yelpazemiz bulunmaktadır. Detaylar için kliniğimize ulaşın. 😊' : 'We offer a wide range of treatments. Contact us for details. 😊',
      whatsapp: lang === 'tr' ? 'WhatsApp üzerinden bize ulaşabilirsiniz. 💬' : 'You can reach us on WhatsApp. 💬',
      default:  lang === 'tr' ? 'Yardımcı olmaktan memnuniyet duyarım! Daha fazla bilgi için kliniğimizle iletişime geçin. 😊' : "I'm happy to help! Please contact our clinic for more information. 😊",
    };

    /* ── state ── */
    var isOpen = false;

    /* ── welcome ── */
    appendMsg(s.welcomeMessage, false, true);

    /* ── bubbles ── */
    var bubbleTexts = (sbMsg[lang] && sbMsg[lang].length) ? sbMsg[lang] : sbMsg.en;
    var bubbleIdx = 0, bubbleTimer = null, currentBubble = null;

    function showNextBubble() {
      if (isOpen || !sb.enabled) return;
      if (currentBubble) { currentBubble.remove(); currentBubble = null; }
      setTimeout(function() {
        if (isOpen) return;
        var el = d.createElement('div');
        el.className = 'cbw-bubble';
        var txt = bubbleTexts[bubbleIdx % bubbleTexts.length]; bubbleIdx++;
        el.innerHTML = '<span class="cbw-bdot"></span><span style="flex:1">' + escHtml(txt) + '</span><span class="cbw-bx">×</span>';
        el.querySelector('.cbw-bx').addEventListener('click', function(e) { e.stopPropagation(); clearBubbles(); });
        el.addEventListener('click', openPanel);
        bubblesEl.appendChild(el);
        currentBubble = el;
        bubbleTimer = setTimeout(showNextBubble, (sbTiming.rotationIntervalSeconds || 6) * 1000);
      }, 350);
    }

    function clearBubbles() {
      clearTimeout(bubbleTimer);
      if (currentBubble) { currentBubble.remove(); currentBubble = null; }
    }

    if (sb.enabled && sb.displayMode !== 'disabled') {
      setTimeout(showNextBubble, (sbTiming.initialDelaySeconds || 3) * 1000);
    }

    /* ── open/close ── */
    function openPanel() {
      isOpen = true; clearBubbles();
      panel.classList.add('cbw-open');
      panel.setAttribute('aria-hidden', 'false');
      input.focus();
    }
    function closePanel() {
      isOpen = false;
      panel.classList.remove('cbw-open');
      panel.setAttribute('aria-hidden', 'true');
      if (sb.enabled) setTimeout(showNextBubble, 8000);
    }

    launcher.addEventListener('click', function() { isOpen ? closePanel() : openPanel(); });
    closeBtn.addEventListener('click', closePanel);

    /* ── messages ── */
    function appendMsg(text, isUser, isWelcome) {
      var div = d.createElement('div');
      div.className = 'cbw-msg ' + (isUser ? 'cbw-user' : 'cbw-bot');
      var time = isWelcome ? (lang === 'tr' ? 'Az önce' : 'Just now') : new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      div.innerHTML = '<div class="cbw-bubble-msg">' + text + '</div><span class="cbw-ts">' + time + '</span>';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function send(text, key) {
      if (!text.trim()) return;
      appendMsg(escHtml(text), true, false);
      quickEl.style.display = 'none';
      var typing = d.createElement('div');
      typing.id = 'cbw-typing'; typing.className = 'cbw-msg cbw-bot cbw-typing';
      typing.innerHTML = '<div class="cbw-bubble-msg"><span class="cbw-tdot"></span><span class="cbw-tdot"></span><span class="cbw-tdot"></span></div>';
      msgs.appendChild(typing); msgs.scrollTop = msgs.scrollHeight;
      setTimeout(function() {
        var t = d.getElementById('cbw-typing'); if (t) t.remove();
        appendMsg(BOT_REPLIES[key] || BOT_REPLIES.default, false, false);
      }, 900 + Math.random() * 400);
    }

    quickEl.querySelectorAll('.cbw-qbtn').forEach(function(btn) {
      btn.addEventListener('click', function() { send(btn.textContent, btn.dataset.key); });
    });
    sendBtn.addEventListener('click', function() { var v = input.value; input.value = ''; send(v); });
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { var v = input.value; input.value = ''; send(v); } });

    /* ── public API ── */
    w.ClinicBridgeWidget = { open: openPanel, close: closePanel, clinicId: clinicId };
  }

  /* ── helpers ── */
  function escHtml(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(t) { return String(t).replace(/"/g,'&quot;'); }

  /* ── boot ── */
  function boot() {
    fetchSettings().then(function(cfg) { buildWidget(cfg || {}); });
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
