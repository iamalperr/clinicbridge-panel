/**
 * ClinicBridge AI Widget v6.0 — Shadow DOM + Full i18n
 * https://widget.clinicbridge-ai.com/widget.js
 *
 * Usage:
 *   <script src="..." data-clinic-id="CLINIC_ID" async></script>
 *   <script src="..." data-clinic-id="CLINIC_ID" data-language="tr" async></script>
 *   <script src="..." data-clinic-id="CLINIC_ID" data-language="en" data-debug="true" async></script>
 *
 * What's new in v6.0:
 *   - Shadow DOM: widget is 100% isolated from host page CSS
 *   - Single resolvedLang drives ALL text (greeting, placeholder, quick actions, system strings)
 *   - data-debug="true" logs diagnostics to console
 *   - CSS reset inside shadow root prevents host-site style bleed
 */
(function (w, d) {
  'use strict';
  if (w.__cbwLoaded) return;

  // ── Domain guard ─────────────────────────────────────────────────────────────
  var _host = w.location.hostname;
  var _blocked = [
    'clinicbridge-ai.com', 'www.clinicbridge-ai.com',
    'app.clinicbridge-ai.com', 'widget.clinicbridge-ai.com',
    'localhost', '127.0.0.1',
  ];
  if (_blocked.indexOf(_host) !== -1) return;
  // ─────────────────────────────────────────────────────────────────────────────

  w.__cbwLoaded = true;

  var scriptEl  = d.currentScript || d.querySelector('script[data-clinic-id]');
  var clinicId  = (scriptEl && scriptEl.dataset.clinicId) || 'demo';
  var embedLang = (scriptEl && scriptEl.dataset.language) || null;   // "tr" | "en" | null
  var embedTestMode = (scriptEl && scriptEl.dataset.testMode) === 'true';
  var debugMode = scriptEl && scriptEl.dataset.debug === 'true';
  var API_BASE  = 'https://app.clinicbridge-ai.com';
  var POLL_MS   = 5000;
  var VERSION   = '6.2.0';

  /* ── Session ID ── */
  var sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

  /* ── Debug helper ── */
  function dbg() {
    if (!debugMode) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[ClinicBridge Widget v' + VERSION + ']');
    console.log.apply(console, args);
  }

  /* ── Language resolver ────────────────────────────────────────────────────────
     Priority: data-language attr → config.defaultLanguage → browser lang      */
  function resolveLang(cfg) {
    var source, lang;
    if (embedLang === 'tr' || embedLang === 'en') {
      source = 'embed-attr (data-language="' + embedLang + '")';
      lang = embedLang;
    } else if (cfg && cfg.defaultLanguage && cfg.defaultLanguage !== 'auto') {
      source = 'config.defaultLanguage="' + cfg.defaultLanguage + '"';
      lang = cfg.defaultLanguage;
    } else {
      var nav = (navigator.language || (navigator.languages && navigator.languages[0]) || 'en');
      lang = nav.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
      source = 'browser lang (' + nav + ')';
    }
    dbg('Language resolved:', lang, '| source:', source);
    return lang;
  }

  /* ── System strings (locale-aware) ── */
  var SYS = {
    tr: {
      online:    'Çevrimiçi',
      justNow:   'Az önce',
      send:      'Gönder',
      powered:   'ClinicBridge AI ile desteklenmektedir',
      noReply:   'Üzgünüm, şu an yanıt üretemiyorum. Lütfen kliniğimizi arayın.',
      connErr:   'Bağlantı hatası oluştu. Lütfen kliniğimizi doğrudan arayın. 📞',
      closeAria: 'Kapat',
      openAria:  'ClinicBridge AI Asistanı Aç',
      consentTitle: 'KVKK ve Gizlilik',
      consentText: 'Yapay zekâ asistanımızla yapacağınız görüşmelerde sağladığınız bilgiler hizmet kalitesi amacıyla işlenebilir. Devam ederek Aydınlatma Metni’ni kabul etmiş olursunuz.',
      consentAccept: 'Kabul Ediyorum ve Devam Et',
      consentDecline: 'Reddet',
    },
    en: {
      online:    'Online',
      justNow:   'Just now',
      send:      'Send',
      powered:   'Powered by ClinicBridge AI',
      noReply:   'Sorry, I cannot respond right now. Please call the clinic.',
      connErr:   'Connection error. Please call the clinic directly. 📞',
      closeAria: 'Close',
      openAria:  'Open ClinicBridge AI Assistant',
      consentTitle: 'Privacy & Data Protection',
      consentText: 'Information you share with our AI assistant may be processed to improve service quality. By continuing, you acknowledge the privacy notice.',
      consentAccept: 'Accept and Continue',
      consentDecline: 'Decline',
    },
  };

  /* ── Default per-language messages ── */
  var DEF_MSG = {
    tr: {
      greetingMessage:  'Merhaba! Size nasıl yardımcı olabiliriz?',
      inputPlaceholder: 'Bir mesaj yazın...',
      tooltipMessage:   'Merhaba, size nasıl yardımcı olabiliriz?',
      quickActions:     ['Randevu almak istiyorum', 'Hizmetleriniz nelerdir?', 'Kliniğiniz nerede?'],
    },
    en: {
      greetingMessage:  'Hello! How can we help you?',
      inputPlaceholder: 'Type your message...',
      tooltipMessage:   'Hello, how can we help you?',
      quickActions:     ['Book an appointment', 'What services do you offer?', 'Where is your clinic?'],
    },
  };

  /* ── Show-bubbles defaults ── */
  var DEF_BUBBLES = {
    enabled: true, displayMode: 'rotate',
    messages: {
      tr: ['Randevu almak ister misiniz?', 'Size nasıl yardımcı olabiliriz?'],
      en: ['Want to book an appointment?', 'How can we help you?'],
    },
    timing:   { initialDelaySeconds: 3, rotationIntervalSeconds: 6 },
    behavior: { hideAfterOpen: true, showOncePerSession: false, disableOnMobile: false },
  };

  /* ── Widget defaults ── */
  var DEF = {
    title: 'ClinicBridge AI',
    primaryColor: '#6366f1',
    position: 'bottom-right',
    showAvatar: true,
    showOnlineStatus: true,
    defaultLanguage: 'auto',
    testMode: false,
    testModeMessage: {
      tr: 'Merhaba, şu anda dijital asistanımızın kurulum süreci devam ediyor. Çok yakında sorularınızı buradan yanıtlayabileceğiz. Randevu ve detaylı bilgi için lütfen kliniğimizle doğrudan iletişime geçiniz.',
      en: 'Hello, our digital assistant is currently being prepared. Very soon, we’ll be able to answer your questions here. For appointments or detailed information, please contact the clinic directly.'
    },
    launcher: {
      shape: "rounded_square",
      position: "bottom_right",
      size: "medium",
      icon: "sparkle",
      text: "Asistan ile konuş",
      showText: false,
      showOnlineIndicator: true,
      showNotificationDot: false,
      tooltipEnabled: true,
      tooltipMessage: "Merhaba 👋",
      tooltipDelaySeconds: 2,
      tooltipAutoHide: true,
    },
    showBubbles: DEF_BUBBLES,
    messages: DEF_MSG,
  };

  /* ─── Fetch config (no-cache) ─── */
  function fetchCfg(cb) {
    fetch(API_BASE + '/api/public/widget-settings/' + clinicId, {
      cache:   'no-store',
      headers: { Accept: 'application/json' },
    })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) { cb(data || {}); })
    .catch(function () { cb({}); });
  }

  /* ─── Deep-merge config with defaults ─── */
  function mergeConfig(cfg) {
    var s = Object.assign({}, DEF, cfg);

    // Merge show-bubbles
    var sb = Object.assign({}, DEF_BUBBLES, s.showBubbles);
    sb.messages  = Object.assign({}, DEF_BUBBLES.messages,  (s.showBubbles || {}).messages);
    sb.timing    = Object.assign({}, DEF_BUBBLES.timing,    (s.showBubbles || {}).timing);
    sb.behavior  = Object.assign({}, DEF_BUBBLES.behavior,  (s.showBubbles || {}).behavior);
    s.showBubbles = sb;

    // Merge i18n messages
    var msgs = { tr: Object.assign({}, DEF_MSG.tr), en: Object.assign({}, DEF_MSG.en) };
    if (cfg.messages) {
      if (cfg.messages.tr) msgs.tr = Object.assign({}, DEF_MSG.tr, cfg.messages.tr);
      if (cfg.messages.en) msgs.en = Object.assign({}, DEF_MSG.en, cfg.messages.en);
    }
    // Back-compat: if old config has flat welcomeMessage/placeholder and no messages.tr
    if (cfg.welcomeMessage && !cfg.messages) msgs.tr.greetingMessage  = cfg.welcomeMessage;
    if (cfg.placeholder    && !cfg.messages) msgs.tr.inputPlaceholder = cfg.placeholder;
    s.messages = msgs;

    dbg('Merged config:', { title: s.title, color: s.primaryColor, defaultLanguage: s.defaultLanguage, messages: s.messages });
    return s;
  }

  /* ─── Get locale for a specific language ─── */
  function getLocale(s, lang) {
    var m = s.messages && s.messages[lang];
    var d = DEF_MSG[lang] || DEF_MSG.en;
    var locale = {
      greetingMessage:  (m && m.greetingMessage)  || d.greetingMessage,
      inputPlaceholder: (m && m.inputPlaceholder) || d.inputPlaceholder,
      tooltipMessage:   (m && m.tooltipMessage)   || d.tooltipMessage,
      quickActions:     (m && m.quickActions && m.quickActions.length) ? m.quickActions : d.quickActions,
    };
    dbg('Locale[' + lang + ']:', locale);
    return locale;
  }

  /* ─── SVGs ─── */
  var SVG_NS = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    tooth: SVG_NS + '<path d="M12 21a5.5 5.5 0 0 1-4.7-2.6c-.6-1-1.3-2.4-1.3-3.4C6 11 4 9 4 6.5A4.5 4.5 0 0 1 8.5 2c1.7 0 3 1.3 3.5 2.5C12.5 3.3 13.8 2 15.5 2A4.5 4.5 0 0 1 20 6.5c0 2.5-2 4.5-2 8.5 0 1-.7 2.4-1.3 3.4A5.5 5.5 0 0 1 12 21z"/><path d="M12 21v-4"/></svg>',
    chat: SVG_NS + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    ai_sparkle: SVG_NS + '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>',
    medical_plus: SVG_NS + '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>',
    heart: SVG_NS + '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    assistant: SVG_NS + '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
    psychology: SVG_NS + '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
    beauty: SVG_NS + '<path d="M12 5a3 3 0 1 1-3 3m3-3a3 3 0 1 0 3 3m-3-3v14m0-14a3 3 0 1 0-3-3m3 3a3 3 0 1 1 3-3m-3 3a3 3 0 1 0-3 3m3-3a3 3 0 1 1 3 3m-3 3a3 3 0 1 0 3-3m-3 3a3 3 0 1 1-3-3"/></svg>',
    clinic: SVG_NS + '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>',
    calendar: SVG_NS + '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
    smile: SVG_NS + '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>',
    minimal: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>'
  };
  var AVT_SVG  = '<svg width="22" height="22" viewBox="0 0 30 30" fill="none"><path d="M15 3.5C12 3.5 9.5 5.8 9 8.8C8.4 6.2 6.4 4.5 5 4.5C5 4.5 6 10 8 13C9.3 15.2 10 18 10 21C10 23.5 11 26 12.8 26C14 26 14.8 24.8 15 22.8C15.2 24.8 16 26 17.2 26C19 26 20 23.5 20 21C20 18 20.7 15.2 22 13C24 10 25 4.5 25 4.5C23.6 4.5 21.6 6.2 21 8.8C20.5 5.8 18 3.5 15 3.5Z" fill="white" opacity="0.9"/></svg>';
  var AVATARS = {
    female_doctor: '<span style="font-size:24px;line-height:1">👩‍⚕️</span>',
    male_doctor: '<span style="font-size:24px;line-height:1">👨‍⚕️</span>',
    clinic_assistant: '<span style="font-size:24px;line-height:1">🧑‍💼</span>',
    minimal: SVG_NS + '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>',
    default: AVT_SVG
  };
  function getAvatarHTML(s) {
    if (s.avatarType === 'custom' && s.customAvatarUrl) {
      return '<img src="' + s.customAvatarUrl + '" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    }
    return AVATARS[s.avatarType] || AVATARS['default'];
  }
  var CLO_SVG  = '<svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var SND_SVG  = '<svg width="17" height="17" fill="none" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ─── CSS (injected into shadow root — fully isolated) ─── */
  function buildCSS(s) {
    var isLeft = s.launcher.position === 'bottom_left' || s.launcher.position === 'middle_left';
    var isMiddle = s.launcher.position === 'middle_left' || s.launcher.position === 'middle_right';
    var c = s.primaryColor;
    
    // Position
    var posCSS = 'position:fixed;' +
      (isMiddle ? 'top:50%;transform:translateY(-50%);' : 'bottom:28px;') +
      (isLeft ? 'left:28px;right:auto;' : 'right:28px;left:auto;');

    // Shape/Size
    var scale = s.launcher.size === 'small' ? 0.85 : (s.launcher.size === 'large' ? 1.15 : 1);
    var shape = s.launcher.shape || 'rounded_square';
    var lRadius = '18px'; var lWidth = '60px'; var lHeight = '60px'; var lPadding = '0';
    var lBg = c; var lShadow = '0 8px 28px ' + c + '70'; var lBorder = 'none'; var lColor = 'white';
    
    if (shape === 'circle') { lRadius = '50%'; }
    if (shape === 'square') { lRadius = '4px'; }
    if (shape === 'pill') { lRadius = '30px'; lWidth = 'auto'; lPadding = '0 24px'; }
    if (shape === 'chat_bubble') { lRadius = isLeft ? '24px 24px 24px 4px' : '24px 24px 4px 24px'; }
    if (shape === 'minimal') {
      lRadius = '50%'; lBg = 'transparent'; lShadow = 'none'; lColor = c;
    }

    if (s.launcher.showText && shape !== 'minimal') {
      lWidth = 'auto';
      lPadding = '0 20px';
    }

    return [
      /* ── Reset: everything inside the shadow root starts clean ── */
      '*, *::before, *::after{box-sizing:border-box;margin:0;padding:0;border:0;',
        'font:inherit;font-size:100%;line-height:normal;vertical-align:baseline;',
        'text-decoration:none;color:inherit;background:transparent;outline:none}',

      /* ── Host container ── */
      ':host{all:initial;' + posCSS + 'z-index:2147483640;display:flex;flex-direction:column;',
        'align-items:' + (isLeft ? 'flex-start' : 'flex-end') + ';gap:10px;',
        'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
        'font-size:14px;line-height:1.5}',

      /* ── Bubbles ── */
      '#cbw-bubbles{display:flex;flex-direction:column;gap:8px}',
      '.cbw-bubble{background:#fff!important;border:1px solid ' + c + '25!important;',
        'border-radius:20px 20px 4px 20px!important;padding:10px 14px!important;',
        'font-size:13.5px!important;color:#1e293b!important;',
        'box-shadow:0 4px 18px rgba(0,0,0,.11)!important;',
        'display:flex!important;align-items:center!important;gap:9px!important;',
        'max-width:240px!important;line-height:1.4!important;cursor:pointer!important;',
        'animation:cbw-bubble-in .35s cubic-bezier(.34,1.56,.64,1)!important}',
      '.cbw-bubble:hover{box-shadow:0 6px 22px rgba(0,0,0,.15)!important;',
        'transform:translateX(' + (isLeft ? '' : '-') + '3px)!important}',
      '.cbw-bdot{width:8px!important;height:8px!important;border-radius:50%!important;',
        'background:' + c + '!important;flex-shrink:0!important}',
      '.cbw-bx{margin-left:auto!important;color:#94A3B8!important;',
        'font-size:16px!important;flex-shrink:0!important;line-height:1!important;cursor:pointer!important}',
      '@keyframes cbw-bubble-in{from{opacity:0;transform:translateY(10px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}',

      /* ── Launcher button ── */
      '#cbw-launcher{width:' + lWidth + '!important;height:' + lHeight + '!important;padding:' + lPadding + '!important;',
        'border-radius:' + lRadius + '!important;border:' + lBorder + '!important;cursor:pointer!important;',
        'background:' + lBg + '!important;color:' + lColor + '!important;',
        'box-shadow:' + lShadow + '!important;display:flex!important;gap:8px!important;',
        'align-items:center!important;justify-content:center!important;',
        'position:relative!important;transition:transform .25s!important;',
        'flex-shrink:0!important;outline:none!important;transform:scale(' + scale + ')!important;font-weight:600!important}',
      '#cbw-launcher:hover{transform:scale(' + (scale * 1.05).toFixed(2) + ') translateY(-2px)!important}',
      '#cbw-launcher *{pointer-events:none!important}',
      '#cbw-online-dot{position:absolute!important;top:-4px!important;right:-4px!important;',
        'width:14px!important;height:14px!important;border-radius:50%!important;',
        'background:#22C55E!important;border:2.5px solid #fff!important;',
        'animation:cbw-ping 2.5s infinite!important}',
      '@keyframes cbw-ping{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}60%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}',

      /* ── Panel ── */
      '#cbw-panel{width:360px!important;background:#fff!important;border-radius:20px!important;',
        'box-shadow:0 20px 60px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05)!important;',
        'overflow:hidden!important;display:flex!important;flex-direction:column!important;',
        'transform:scale(.88) translateY(24px)!important;',
        'transform-origin:bottom ' + (isLeft ? 'left' : 'right') + '!important;',
        'opacity:0!important;pointer-events:none!important;',
        'transition:all .32s cubic-bezier(.34,1.56,.64,1)!important;',
        'position:absolute!important;bottom:74px!important;',
        (isLeft ? 'left:0!important;right:auto!important;' : 'right:0!important;left:auto!important;') + '}',
      '#cbw-panel.cbw-open{transform:scale(1) translateY(0)!important;opacity:1!important;pointer-events:all!important}',

      /* ── Header ── */
      '#cbw-head{background:' + c + '!important;padding:17px 20px!important;',
        'display:flex!important;align-items:center!important;',
        'justify-content:space-between!important;flex-shrink:0!important}',
      '.cbw-hleft{display:flex!important;align-items:center!important;gap:12px!important}',
      '.cbw-avatar{width:40px!important;height:40px!important;border-radius:50%!important;',
        'background:rgba(255,255,255,.2)!important;display:flex!important;',
        'align-items:center!important;justify-content:center!important;flex-shrink:0!important}',
      '.cbw-hname{font-size:13.5px!important;font-weight:700!important;color:#fff!important;',
        'font-family:inherit!important;line-height:1.3!important}',
      '.cbw-hstatus{display:flex!important;align-items:center!important;gap:5px!important;',
        'font-size:12px!important;color:rgba(255,255,255,.85)!important;margin-top:3px!important}',
      '.cbw-sdot{width:7px!important;height:7px!important;border-radius:50%!important;',
        'background:#86EFAC!important;display:inline-block!important;flex-shrink:0!important}',
      '#cbw-close{background:rgba(255,255,255,.18)!important;border:none!important;',
        'border-radius:8px!important;cursor:pointer!important;padding:7px!important;',
        'display:flex!important;color:#fff!important;align-items:center!important;',
        'justify-content:center!important;transition:background .2s!important}',
      '#cbw-close:hover{background:rgba(255,255,255,.3)!important}',

      /* ── Messages area ── */
      '#cbw-msgs{flex:1!important;overflow-y:auto!important;padding:16px!important;',
        'display:flex!important;flex-direction:column!important;gap:12px!important;',
        'min-height:180px!important;max-height:260px!important;scroll-behavior:smooth!important;',
        'background:#fff!important}',
      '.cbw-msg{display:flex!important;flex-direction:column!important;gap:3px!important}',
      '.cbw-bubble-msg{padding:11px 15px!important;font-size:14px!important;',
        'line-height:1.65!important;max-width:86%!important;color:#1e293b!important;',
        'font-family:inherit!important;word-break:break-word!important}',
      '.cbw-bot .cbw-bubble-msg{background:#F1F5F9!important;border-radius:4px 16px 16px 16px!important}',
      '.cbw-user{align-items:flex-end!important}',
      '.cbw-user .cbw-bubble-msg{background:' + c + '!important;color:#fff!important;',
        'border-radius:16px 4px 16px 16px!important}',
      '.cbw-ts{font-size:11px!important;color:#94A3B8!important;padding:0 4px!important;',
        'font-family:inherit!important}',
      '.cbw-user .cbw-ts{text-align:right!important}',

      /* ── Typing indicator ── */
      '.cbw-typing .cbw-bubble-msg{display:flex!important;gap:5px!important;',
        'align-items:center!important;padding:14px 18px!important}',
      '.cbw-tdot{width:8px!important;height:8px!important;border-radius:50%!important;',
        'background:#94A3B8!important;animation:cbw-bounce .8s infinite!important}',
      '.cbw-tdot:nth-child(2){animation-delay:.15s!important}',
      '.cbw-tdot:nth-child(3){animation-delay:.3s!important}',
      '@keyframes cbw-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}',

      /* ── Quick action buttons ── */
      '#cbw-quick{padding:10px 14px!important;display:flex!important;flex-direction:column!important;',
        'gap:7px!important;border-top:1px solid #E2E8F0!important;flex-shrink:0!important;background:#fff!important}',
      '.cbw-qbtn{background:' + c + '18!important;border:1.5px solid ' + c + '30!important;',
        'border-radius:10px!important;padding:9px 13px!important;font-size:13px!important;',
        'font-weight:500!important;color:' + c + '!important;cursor:pointer!important;',
        'text-align:left!important;transition:all .2s!important;font-family:inherit!important;',
        'line-height:1.4!important;width:100%!important}',
      '.cbw-qbtn:hover{background:' + c + '30!important}',

      /* ── Input row ── */
      '#cbw-inputrow{display:flex!important;align-items:center!important;gap:8px!important;',
        'padding:12px 14px!important;border-top:1px solid #E2E8F0!important;',
        'flex-shrink:0!important;background:#fff!important}',
      '#cbw-input{flex:1!important;border:1.5px solid #E2E8F0!important;border-radius:10px!important;',
        'padding:10px 14px!important;font-size:14px!important;font-family:inherit!important;',
        'outline:none!important;transition:border-color .2s!important;',
        'color:#1e293b!important;background:#fff!important;line-height:1.5!important;',
        'width:100%!important}',
      '#cbw-input:focus{border-color:' + c + '!important;box-shadow:0 0 0 3px ' + c + '20!important}',
      '#cbw-send{width:38px!important;height:38px!important;border-radius:10px!important;',
        'border:none!important;cursor:pointer!important;background:' + c + '!important;',
        'display:flex!important;align-items:center!important;justify-content:center!important;',
        'flex-shrink:0!important;transition:transform .2s!important;color:#fff!important}',
      '#cbw-send:hover{transform:scale(1.08)!important}',

      /* ── Powered by ── */
      '#cbw-powered{text-align:center!important;font-size:11px!important;color:#94A3B8!important;',
        'padding:6px 14px 10px!important;border-top:1px solid #F1F5F9!important;',
        'background:#fff!important;font-family:inherit!important}',
      '#cbw-powered a{color:' + c + '!important;text-decoration:none!important;font-weight:600!important}',

      /* ── Responsive ── */
      '@media(max-width:480px){#cbw-panel{width:calc(100vw - 32px)!important;' + (isLeft ? 'left:4px!important' : 'right:-4px!important') + '}}',
    ].join('');
  }

  /* ─── Build DOM inside Shadow Root ─── */
  function buildDOM(hostEl, s, lang, sys) {
    var shadow = hostEl.attachShadow({ mode: 'open' });
    var locale = getLocale(s, lang);

    /* Get SVG icon based on config */
    var lIconSVG = ICONS[s.launcher.icon] || ICONS.tooth;

    /* Build launcher inner html */
    var launcherInner = lIconSVG;
    if (s.launcher.showText && s.launcher.shape !== 'minimal') {
      var lText = typeof s.launcher.text === 'string' 
        ? s.launcher.text 
        : (s.launcher.text && s.launcher.text[lang] ? s.launcher.text[lang] : (lang === 'tr' ? 'Asistan ile konuş' : 'Chat with assistant'));
      launcherInner += '<span>' + lText + '</span>';
    }
    if (s.launcher.showOnlineIndicator) {
      launcherInner += '<div id="cbw-online-dot"></div>';
    }

    /* CSS */
    var styleEl = d.createElement('style');
    styleEl.id  = 'cbw-style';
    styleEl.textContent = buildCSS(s);
    shadow.appendChild(styleEl);

    /* Bubbles container */
    var bubs = d.createElement('div');
    bubs.id   = 'cbw-bubbles';
    shadow.appendChild(bubs);

    /* Panel + Launcher */
    var wrapper = d.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.innerHTML = [
      '<div id="cbw-panel" role="dialog" aria-hidden="true">',
        '<div id="cbw-head">',
          '<div class="cbw-hleft">',
            '<div class="cbw-avatar">' + getAvatarHTML(s) + '</div>',
            '<div>',
              '<span class="cbw-hname"></span>',
              '<div class="cbw-hstatus">',
                '<span class="cbw-sdot"></span>',
                '<span id="cbw-online-text">' + sys.online + '</span>',
              '</div>',
            '</div>',
          '</div>',
          '<button id="cbw-close" aria-label="' + sys.closeAria + '">' + CLO_SVG + '</button>',
        '</div>',
        '<div id="cbw-consent" style="display:none;flex-direction:column;flex:1;padding:24px;text-align:center;align-items:center;justify-content:center;background:#fff;z-index:10;">',
          '<div style="font-size:48px;margin-bottom:16px;">🛡️</div>',
          '<h3 style="margin:0 0 12px;font-size:16px;color:#0f172a;font-family:inherit;">' + sys.consentTitle + '</h3>',
          '<p style="margin:0 0 24px;font-size:13px;color:#475569;line-height:1.5;font-family:inherit;">' + sys.consentText + '</p>',
          '<button id="cbw-consent-accept" style="width:100%;padding:12px;background:' + s.primaryColor + ';color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;margin-bottom:8px;transition:opacity .2s;font-family:inherit;">' + sys.consentAccept + '</button>',
          '<button id="cbw-consent-decline" style="width:100%;padding:10px;background:transparent;color:#64748b;border:none;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">' + sys.consentDecline + '</button>',
        '</div>',
        '<div id="cbw-chat" style="display:flex;flex-direction:column;flex:1;">',
          '<div id="cbw-msgs"></div>',
          '<div id="cbw-quick"></div>',
          '<div id="cbw-inputrow">',
            '<input id="cbw-input" type="text" autocomplete="off" placeholder="' + locale.inputPlaceholder + '"/>',
            '<button id="cbw-send" aria-label="' + sys.send + '">' + SND_SVG + '</button>',
          '</div>',
          '<div id="cbw-powered">',
            '<a href="https://clinicbridge-ai.com" target="_blank" rel="noopener">' + sys.powered + '</a>',
          '</div>',
        '</div>',
      '</div>',
      '<button id="cbw-launcher" aria-label="' + sys.openAria + '">',
        launcherInner,
      '</button>',
    ].join('');

    while (wrapper.firstChild) shadow.appendChild(wrapper.firstChild);

    return shadow;
  }

  /* ─── Apply settings to shadow root DOM ─── */
  function applySettings(shadow, s, lang, sys, firstTime) {
    var locale = getLocale(s, lang);
    
    if (!firstTime) {
      /* Update styles specifically for the panel color etc if needed */
      var styleEl = shadow.getElementById('cbw-style');
      if (styleEl) styleEl.textContent = buildCSS(s);
      
      /* Update launcher content if config changed */
      var launcherBtn = shadow.getElementById('cbw-launcher');
      if (launcherBtn) {
        /* Get SVG icon based on config */
        var lIconSVG = ICONS[s.launcher.icon] || ICONS.tooth;

        var launcherInner = lIconSVG;
        if (s.launcher.showText && s.launcher.shape !== 'minimal') {
          var lText = typeof s.launcher.text === 'string' 
            ? s.launcher.text 
            : (s.launcher.text && s.launcher.text[lang] ? s.launcher.text[lang] : (lang === 'tr' ? 'Asistan ile konuş' : 'Chat with assistant'));
          launcherInner += '<span>' + lText + '</span>';
        }
        if (s.launcher.showOnlineIndicator) {
          launcherInner += '<div id="cbw-online-dot"></div>';
        }
        launcherBtn.innerHTML = launcherInner;
      }
    }

    /* Title */
    var hname = shadow.querySelector('.cbw-hname');
    if (hname) hname.textContent = s.title || 'ClinicBridge AI';

    /* Online text */
    var onlineText = shadow.getElementById('cbw-online-text');
    if (onlineText) onlineText.textContent = sys.online;

    /* Online dot visibility */
    var onlineDot = shadow.getElementById('cbw-online-dot');
    if (onlineDot) onlineDot.style.display = s.showOnlineStatus ? '' : 'none';
    var hstatus = shadow.querySelector('.cbw-hstatus');
    if (hstatus) hstatus.style.display = s.showOnlineStatus ? '' : 'none';

    /* Avatar visibility and content */
    var avt = shadow.querySelector('.cbw-avatar');
    if (avt) {
      avt.style.display = s.showAvatar ? '' : 'none';
      if (!firstTime) avt.innerHTML = getAvatarHTML(s);
    }

    /* Input placeholder */
    var inp = shadow.getElementById('cbw-input');
    if (inp) inp.placeholder = locale.inputPlaceholder;

    /* Quick actions (first load only) */
    if (firstTime) {
      var quickEl = shadow.getElementById('cbw-quick');
      if (quickEl) {
        quickEl.innerHTML = locale.quickActions.map(function (qa) {
          return '<button class="cbw-qbtn">' + qa + '</button>';
        }).join('');
      }
    }

    /* Bubble texts */
    var sb = s.showBubbles || DEF.showBubbles || DEF_BUBBLES;
    var bubLang = (sb.messages && sb.messages[lang] && sb.messages[lang].length) ? lang : 'en';
    var texts = sb.messages[bubLang] ? sb.messages[bubLang].slice() : [];
    if (s.launcher.tooltipEnabled && locale.tooltipMessage) {
      // Prepend tooltip if not already there
      if (texts.indexOf(locale.tooltipMessage) === -1) {
        texts.unshift(locale.tooltipMessage);
      }
    }
    w.__cbwBubbleTexts    = texts;
    w.__cbwBubblesEnabled = (sb.enabled && sb.displayMode !== 'disabled') || s.launcher.tooltipEnabled;
    w.__cbwBubbleInterval = (sb.timing.rotationIntervalSeconds || 6) * 1000;
    w.__cbwBubbleDelay    = s.launcher.tooltipEnabled ? (s.launcher.tooltipDelaySeconds * 1000) : ((sb.timing.initialDelaySeconds || 3) * 1000);

    /* Welcome message (first load only) */
    if (firstTime) {
      var msgs = shadow.getElementById('cbw-msgs');
      if (msgs) appendMsg(shadow, locale.greetingMessage, false, sys.justNow, true);
    }
  }

  /* ─── Append a message bubble ─── */
  function appendMsg(shadow, text, isUser, timeLabel, isWelcome) {
    var msgs = shadow.getElementById('cbw-msgs');
    if (!msgs) return;
    var div = d.createElement('div');
    div.className = 'cbw-msg ' + (isUser ? 'cbw-user' : 'cbw-bot');
    var time = isWelcome
      ? timeLabel
      : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = '<div class="cbw-bubble-msg">' + text + '</div>' +
                    '<span class="cbw-ts">' + time + '</span>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ─── Log conversation to Firestore ─── */
  function logMessage(userMessage) {
    fetch(API_BASE + '/api/public/conversation-log', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ clinicId: clinicId, sessionId: sessionId, userMessage: userMessage }),
    }).catch(function () {});
  }

  /* ─── BOOT ─── */
  function boot() {
    var resolvedLang = 'en'; // will be finalized after first fetch
    var isTestMode   = false;
    var testModeMsg  = '';
    var shadow       = null;
    var isOpen       = false;
    var bubbleTimer  = null;
    var currentBubble = null;
    var pollTimer    = null;
    var lastHash     = '';
    var chatHistory  = [];
    var pendingApptData = null;

    /* Create host element (Shadow DOM container) */
    var hostEl = d.createElement('div');
    hostEl.id  = 'cbw-host';
    d.body.appendChild(hostEl);

    dbg('Boot | clinicId:', clinicId, '| embedLang:', embedLang, '| embedTestMode:', embedTestMode, '| debug:', debugMode, '| version:', VERSION);

    /* ── Initial fetch ── */
    fetchCfg(function (raw) {
      var s = mergeConfig(raw);
      resolvedLang = resolveLang(raw);
      var sys = SYS[resolvedLang] || SYS.en;

      isTestMode = embedTestMode || !!s.testMode;
      testModeMsg = (s.testModeMessage && s.testModeMessage[resolvedLang]) || DEF.testModeMessage[resolvedLang] || DEF.testModeMessage.en;

      var consentKey = 'clinicbridge_consent_' + clinicId;
      var hasConsent = w.localStorage.getItem(consentKey) === 'true';

      dbg('Config loaded:', { 
        title: s.title, 
        color: s.primaryColor, 
        resolvedLang: resolvedLang, 
        testMode: isTestMode,
        consentAccepted: hasConsent,
        avatar: s.avatarType || 'default',
        launcherShape: s.launcher.shape,
        launcherIcon: s.launcher.icon,
        launcherShowText: s.launcher.showText
      });
      shadow = buildDOM(hostEl, s, resolvedLang, sys);
      applySettings(shadow, s, resolvedLang, sys, true);
      lastHash = JSON.stringify(raw);

      wireEvents(shadow, s, resolvedLang, sys, isTestMode, testModeMsg);
      startBubbles(shadow);
      startPolling(shadow);
    });

    /* ── Wire events ── */
    function wireEvents(shadow, initSettings, lang, sys, testMode, testMsg) {
      shadow.getElementById('cbw-launcher').addEventListener('click', function () {
        isOpen ? closePanel(shadow) : openPanel(shadow);
      });
      shadow.getElementById('cbw-close').addEventListener('click', function () {
        closePanel(shadow);
      });
      shadow.getElementById('cbw-send').addEventListener('click', function () {
        sendFromInput(shadow, lang, sys, testMode, testMsg);
      });
      shadow.getElementById('cbw-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') sendFromInput(shadow, lang, sys, testMode, testMsg);
      });
      shadow.getElementById('cbw-quick').addEventListener('click', function (e) {
        var btn = e.target.closest('.cbw-qbtn');
        if (btn) send(shadow, btn.textContent.trim(), lang, sys, testMode, testMsg);
      });
      
      var consentAccept = shadow.getElementById('cbw-consent-accept');
      if (consentAccept) {
        consentAccept.addEventListener('click', function () {
          w.localStorage.setItem('clinicbridge_consent_' + clinicId, 'true');
          shadow.getElementById('cbw-consent').style.display = 'none';
          shadow.getElementById('cbw-chat').style.display = 'flex';
          var inp = shadow.getElementById('cbw-input');
          if (inp) inp.focus();
        });
      }
      var consentDecline = shadow.getElementById('cbw-consent-decline');
      if (consentDecline) {
        consentDecline.addEventListener('click', function () {
          closePanel(shadow);
        });
      }
    }

    function sendFromInput(shadow, lang, sys, testMode, testMsg) {
      var inp = shadow.getElementById('cbw-input');
      if (!inp) return;
      var v = inp.value.trim();
      inp.value = '';
      if (v) send(shadow, v, lang, sys, testMode, testMsg);
    }

    function send(shadow, text, lang, sys, testMode, testMsg) {
      if (!text.trim()) return;
      appendMsg(shadow, text, true, '', false);
      
      // Only log to conversation log if NOT in test mode (or optionally add isTest to it, but bypassing is safer)
      if (!testMode) logMessage(text);
      
      chatHistory.push({ role: 'user', content: text });

      /* Hide quick actions */
      var q = shadow.getElementById('cbw-quick');
      if (q) q.style.display = 'none';

      /* Typing indicator */
      var msgs = shadow.getElementById('cbw-msgs');
      var typing = d.createElement('div');
      typing.id = 'cbw-typing';
      typing.className = 'cbw-msg cbw-bot cbw-typing';
      typing.innerHTML = '<div class="cbw-bubble-msg">' +
        '<span class="cbw-tdot"></span><span class="cbw-tdot"></span><span class="cbw-tdot"></span>' +
        '</div>';
      if (msgs) { msgs.appendChild(typing); msgs.scrollTop = msgs.scrollHeight; }

      /* If Test Mode, bypass API and return static response */
      if (testMode) {
        setTimeout(function () {
          var t = shadow.getElementById('cbw-typing'); if (t) t.remove();
          chatHistory.push({ role: 'assistant', content: testMsg });
          appendMsg(shadow, testMsg, false, '', false);
        }, 800);
        return;
      }

      /* API call */
      fetch(API_BASE + '/api/public/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clinicId:              clinicId,
          message:               text,
          history:               chatHistory.slice(-12),
          conversationId:        sessionId,
          language:              lang,
          pendingAppointmentData: pendingApptData || undefined,
        }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var t = shadow.getElementById('cbw-typing'); if (t) t.remove();
        var reply = (data && data.reply) ? data.reply : sys.noReply;
        chatHistory.push({ role: 'assistant', content: reply });
        appendMsg(shadow, reply, false, '', false);
        if (data && data.pendingAppointmentData) pendingApptData = data.pendingAppointmentData;
        if (data && data.appointmentCreated)     pendingApptData = null;
      })
      .catch(function () {
        var t = shadow.getElementById('cbw-typing'); if (t) t.remove();
        appendMsg(shadow, sys.connErr, false, '', false);
      });
    }

    /* ── Open / Close ── */
    function openPanel(shadow) {
      isOpen = true;
      clearBubbles(shadow);
      var p = shadow.getElementById('cbw-panel');
      if (p) { p.classList.add('cbw-open'); p.setAttribute('aria-hidden', 'false'); }
      
      var consentKey = 'clinicbridge_consent_' + clinicId;
      var hasConsent = w.localStorage.getItem(consentKey) === 'true';
      var consentEl = shadow.getElementById('cbw-consent');
      var chatEl = shadow.getElementById('cbw-chat');
      
      if (!hasConsent) {
        if (consentEl) consentEl.style.display = 'flex';
        if (chatEl) chatEl.style.display = 'none';
      } else {
        if (consentEl) consentEl.style.display = 'none';
        if (chatEl) chatEl.style.display = 'flex';
        var inp = shadow.getElementById('cbw-input');
        if (inp) inp.focus();
      }
    }
    function closePanel(shadow) {
      isOpen = false;
      var p = shadow.getElementById('cbw-panel');
      if (p) { p.classList.remove('cbw-open'); p.setAttribute('aria-hidden', 'true'); }
      if (w.__cbwBubblesEnabled) setTimeout(function () { startBubbles(shadow); }, 8000);
    }

    /* ── Bubbles ── */
    var bubIdx = 0;
    function startBubbles(shadow) {
      if (isOpen || !w.__cbwBubblesEnabled) return;
      clearBubbles(shadow);
      setTimeout(function () { showBubble(shadow); }, w.__cbwBubbleDelay || 3000);
    }
    function showBubble(shadow) {
      if (isOpen) return;
      var texts = w.__cbwBubbleTexts || [];
      if (!texts.length) return;
      if (currentBubble) { currentBubble.remove(); currentBubble = null; }
      var el = d.createElement('div');
      el.className = 'cbw-bubble';
      el.innerHTML = '<span class="cbw-bdot"></span>' +
                     '<span style="flex:1;font-size:13.5px;color:#1e293b">' + texts[bubIdx % texts.length] + '</span>' +
                     '<span class="cbw-bx">×</span>';
      bubIdx++;
      el.querySelector('.cbw-bx').addEventListener('click', function (e) {
        e.stopPropagation(); clearBubbles(shadow);
      });
      el.addEventListener('click', function () { openPanel(shadow); });
      var bc = shadow.getElementById('cbw-bubbles');
      if (bc) bc.appendChild(el);
      currentBubble = el;
      bubbleTimer = setTimeout(function () { showBubble(shadow); }, w.__cbwBubbleInterval || 6000);
    }
    function clearBubbles(shadow) {
      clearTimeout(bubbleTimer);
      if (currentBubble) { currentBubble.remove(); currentBubble = null; }
      /* clear any leftover bubbles in the container */
      var bc = shadow && shadow.getElementById('cbw-bubbles');
      if (bc) bc.innerHTML = '';
    }

    /* ── Polling ── */
    function startPolling(shadow) {
      pollTimer = setInterval(function () {
        fetchCfg(function (raw) {
          var hash = JSON.stringify(raw);
          if (hash === lastHash) return;
          lastHash = hash;
          var s = mergeConfig(raw);
          var sys = SYS[resolvedLang] || SYS.en;
          
          /* Check if test mode toggled via backend */
          isTestMode = embedTestMode || !!s.testMode;
          testModeMsg = (s.testModeMessage && s.testModeMessage[resolvedLang]) || DEF.testModeMessage[resolvedLang] || DEF.testModeMessage.en;

          applySettings(shadow, s, resolvedLang, sys, false);
          clearBubbles(shadow);
          if (!isOpen && w.__cbwBubblesEnabled) setTimeout(function () { showBubble(shadow); }, 1000);
        });
      }, POLL_MS);
    }

    w.addEventListener('beforeunload', function () {
      clearInterval(pollTimer);
      if (shadow) clearBubbles(shadow);
    });

    /* ── Public API ── */
    w.ClinicBridgeWidget = {
      open:     function () { if (shadow) openPanel(shadow); },
      close:    function () { if (shadow) closePanel(shadow); },
      clinicId: clinicId,
      version:  VERSION,
      lang:     function () { return resolvedLang; },
    };
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
