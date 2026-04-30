/* === NAVBAR SCROLL === */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

/* === HAMBURGER MENU === */
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');
hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('mobile-open');
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => navLinks.classList.remove('mobile-open'));
});

/* === APPOINTMENT FORM === */
const form = document.getElementById('appointment-form');
const formSuccess = document.getElementById('form-success');
const formSubmit = document.getElementById('form-submit');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  formSubmit.textContent = currentLang === 'tr' ? 'Gönderiliyor…' : 'Sending…';
  formSubmit.disabled = true;
  setTimeout(() => {
    formSuccess.style.display = 'flex';
    formSubmit.disabled = false;
    form.reset();
    applyLang(currentLang);
    setTimeout(() => { formSuccess.style.display = 'none'; }, 6000);
  }, 1400);
});

/* ═══════════════════════════════════════════════════
   I18N SYSTEM
═══════════════════════════════════════════════════ */
const T = {
  en: {
    nav: { treatments:'Treatments', about:'About', doctors:'Doctors', testimonials:'Testimonials', contact:'Contact', cta:'Book Appointment' },
    hero: {
      badge:'✦ Trusted by 5,000+ Patients',
      h1:'Premium Dental Care<br />for a <span class="gradient-text">Confident Smile</span>',
      sub:'Experience modern dentistry with cutting-edge technology and a compassionate team dedicated to giving you the smile you deserve — comfortably and safely.',
      cta1:'Book an Appointment', cta2:'Our Treatments',
      years:'Years Experience', patients:'Happy Patients', satisfaction:'Satisfaction Rate'
    },
    trust: { iso:'ISO Certified Clinic', sterilized:'Sterilized & Safe Equipment', flexible:'Flexible Appointment Hours', emergency:'Same-Day Emergency Care' },
    treatments: {
      tag:'Our Services', h2:'Comprehensive Dental Treatments',
      desc:'We offer a full spectrum of dental services using the latest technology to ensure the best outcomes for our patients.',
      learnMore:'Learn More →',
      cards: [
        { title:'Implant Treatment', desc:'Permanent, natural-looking tooth replacements using titanium implants that integrate seamlessly with your jawbone.' },
        { title:'Teeth Whitening', desc:'Professional-grade whitening treatments that safely brighten your smile by several shades in a single session.' },
        { title:'Smile Design', desc:'A personalized aesthetic transformation combining veneers, shaping, and whitening for your perfect smile.' },
        { title:'Orthodontics', desc:'Modern braces and clear aligner systems to straighten teeth and correct bite issues for all ages.' },
        { title:'Root Canal Treatment', desc:'Pain-free endodontic therapy to save infected teeth and restore full function with minimal discomfort.' },
        { title:'Dental Check-up', desc:'Comprehensive oral exams and digital X-rays to detect issues early and keep your smile healthy long-term.' },
      ]
    },
    about: {
      tag:'About Us', h2:'Your Health Is Our Priority',
      badgeTxt:'Years of Excellence',
      lead:'Nova Dental Clinic was founded with a single mission: to deliver premium dental care in a warm, stress-free environment where every patient feels truly valued.',
      para:'Since 2009, we have been combining clinical excellence with cutting-edge dental technology to transform smiles. Our team of specialists continuously advances their skills through international training programs.',
      list:['State-of-the-art digital X-ray & 3D scanning','Multilingual patient support team','Sedation options for anxious patients','Transparent pricing with no hidden fees'],
      cta:'Meet Our Team'
    },
    doctors: {
      tag:'Our Specialists', h2:'Meet the Doctors',
      desc:'Our experienced team of dental professionals is committed to providing personalized, compassionate care.',
      cards: [
        { title:'Oral & Maxillofacial Surgeon', bio:'Dr. Reid has over 18 years of experience specializing in complex implant surgeries and full-mouth reconstructions. He trained at King\'s College London and regularly lectures at international dental conferences.' },
        { title:'Cosmetic Dentist & Smile Designer', bio:'Dr. Vasquez is renowned for her artistic approach to smile design. With a background in aesthetic dentistry from Barcelona, she creates beautiful, natural-looking transformations tailored to each patient\'s unique facial structure.' },
        { title:'Orthodontist', bio:'Dr. Holloway specializes in modern orthodontics for children and adults, offering both traditional braces and invisible aligners. He is a certified Invisalign provider and has helped over 2,000 patients achieve straighter smiles.' },
      ]
    },
    testimonials: {
      tag:'Patient Stories', h2:'What Our Patients Say',
      desc:'Real experiences from real patients who trusted us with their smiles.',
      cards: [
        { quote:'"I had severe dental anxiety for years. The team at Nova Dental made me feel completely at ease from the first consultation. My smile design result is beyond anything I imagined — I genuinely can\'t stop smiling now."', role:'Smile Design Patient' },
        { quote:'"Dr. Reid performed my implant surgery and the entire process was pain-free and professional. The follow-up care was exceptional. Six months later my implant feels and looks completely natural."', role:'Implant Treatment Patient' },
        { quote:'"Nova Dental is on another level. The clinic is beautiful, the technology is impressive, and most importantly, Dr. Vasquez actually listened to what I wanted. My teeth are now 8 shades whiter and perfectly shaped."', role:'Whitening & Veneer Patient' },
        { quote:'"My son started orthodontic treatment here at age 12. Dr. Holloway was incredibly patient and made the whole experience fun for him. Two years later, we couldn\'t be happier with the results."', role:'Orthodontics (Parent)' },
        { quote:'"I\'ve been coming to Nova Dental for my annual check-ups for four years now. Their digital scanning technology caught an issue early that my previous dentist had missed for years."', role:'Regular Check-up Patient' },
        { quote:'"I was terrified of root canal treatment after horror stories, but the team made it completely painless. The procedure took only an hour and I walked out feeling fine."', role:'Root Canal Patient' },
      ]
    },
    contact: {
      tag:'Get In Touch', h2:'Book Your Appointment',
      desc:'Ready to transform your smile? Contact us today and our team will get back to you within 24 hours to confirm your appointment.',
      phone:'Phone', email:'Email', address:'Address', hours:'Hours',
      formTitle:'Request an Appointment',
      fields: { name:'Full Name', phone:'Phone Number', email:'Email Address', treatment:'Treatment of Interest', date:'Preferred Date', notes:'Additional Notes' },
      placeholders: { name:'Jane Smith', phone:'+1 (555) 000-0000', email:'jane@example.com', notes:'Tell us about your concern or any special requirements…' },
      selectDefault:'Select a treatment…',
      treatmentOptions:['Implant Treatment','Teeth Whitening','Smile Design','Orthodontics','Root Canal Treatment','Dental Check-up','Other / Not sure'],
      submit:'Send Appointment Request',
      success:"Thank you! We'll contact you within 24 hours to confirm your appointment."
    },
    footer: {
      treatments:'Treatments', clinic:'Clinic', contact:'Contact',
      copy:'© 2025 Nova Dental Clinic. All rights reserved.'
    }
  },

  tr: {
    nav: { treatments:'Tedaviler', about:'Hakkımızda', doctors:'Doktorlarımız', testimonials:'Yorumlar', contact:'İletişim', cta:'Randevu Al' },
    hero: {
      badge:'✦ 5.000+ Hasta Tarafından Tercih Ediliyor',
      h1:'Özgüvenli Bir Gülüş İçin<br /><span class="gradient-text">Premium Diş Bakımı</span>',
      sub:'En son teknoloji ve şefkatli ekibimizle modern diş hekimliği deneyimi sunuyoruz — konforlu ve güvenli bir şekilde hayalinizdeki gülüşe kavuşun.',
      cta1:'Randevu Al', cta2:'Tedavilerimiz',
      years:'Yıl Deneyim', patients:'Mutlu Hasta', satisfaction:'Memnuniyet Oranı'
    },
    trust: { iso:'ISO Sertifikalı Klinik', sterilized:'Sterilize & Güvenli Ekipman', flexible:'Esnek Randevu Saatleri', emergency:'Aynı Gün Acil Bakım' },
    treatments: {
      tag:'Hizmetlerimiz', h2:'Kapsamlı Diş Tedavileri',
      desc:'Hastalarımız için en iyi sonuçları sağlamak amacıyla en son teknolojiyi kullanarak geniş bir yelpazede diş hizmetleri sunuyoruz.',
      learnMore:'Daha Fazla →',
      cards: [
        { title:'İmplant Tedavisi', desc:'Çene kemiğinize sorunsuz entegre olan titanyum implantlar kullanarak kalıcı, doğal görünümlü diş replasman çözümleri sunuyoruz.' },
        { title:'Diş Beyazlatma', desc:'Tek seansta gülüşünüzü birkaç ton parlatan, güvenli profesyonel beyazlatma tedavileri uyguluyoruz.' },
        { title:'Gülüş Tasarımı', desc:'Veneer, şekillendirme ve beyazlatmayı bir araya getiren kişiselleştirilmiş estetik dönüşümle kusursuz gülüşünüze kavuşun.' },
        { title:'Ortodonti', desc:'Her yaş için diş teli ve şeffaf plak sistemleriyle dişleri düzelten ve ısırma sorunlarını gideren modern tedaviler.' },
        { title:'Kanal Tedavisi', desc:'Enfekte dişleri kurtarmak ve tam işlevi en az rahatsızlıkla geri kazandırmak için ağrısız endodontik tedavi.' },
        { title:'Diş Kontrolü', desc:'Sorunları erken tespit etmek ve gülüşünüzü uzun vadede sağlıklı tutmak için kapsamlı muayene ve dijital röntgen.' },
      ]
    },
    about: {
      tag:'Hakkımızda', h2:'Sağlığınız Bizim Önceliğimiz',
      badgeTxt:'Yıllık Uzmanlık',
      lead:'Nova Diş Kliniği tek bir misyonla kuruldu: her hastanın gerçekten değerli hissettiği sıcak ve stressiz bir ortamda premium diş bakımı sunmak.',
      para:'2009\'dan bu yana klinik mükemmeliyetini son teknoloji diş hekimliğiyle harmanlayarak gülüşleri dönüştürüyoruz. Uzman ekibimiz sürekli eğitimlerle bilgi ve becerilerini güncel tutuyor.',
      list:['Son teknoloji dijital röntgen ve 3D tarama','Çok dilli hasta destek ekibi','Endişeli hastalar için sedasyon seçenekleri','Gizli ücret olmaksızın şeffaf fiyatlandırma'],
      cta:'Ekibimizle Tanışın'
    },
    doctors: {
      tag:'Uzmanlarımız', h2:'Doktorlarımızla Tanışın',
      desc:'Deneyimli diş hekimliği ekibimiz, kişiselleştirilmiş ve şefkatli bakım sunmaya adanmıştır.',
      cards: [
        { title:'Ağız ve Çene Cerrahı', bio:'Dr. Reid, karmaşık implant cerrahisi ve tam ağız restorasyonunda 18+ yıllık deneyime sahiptir. King\'s College London\'da eğitim almış olup uluslararası diş hekimliği kongrelerinde düzenli olarak konuşmacı olarak yer almaktadır.' },
        { title:'Estetik Diş Hekimi & Gülüş Tasarımcısı', bio:'Dr. Vasquez, gülüş tasarımına artistik yaklaşımıyla tanınmaktadır. Barselona\'da estetik diş hekimliği alanında eğitim alan Dr. Vasquez, her hastanın yüz yapısına özel doğal görünümlü dönüşümler yaratmaktadır.' },
        { title:'Ortodontist', bio:'Dr. Holloway, çocuklar ve yetişkinler için modern ortodonti alanında uzmanlaşmış; geleneksel diş teli ve şeffaf plak sistemleri sunmaktadır. Sertifikalı Invisalign uygulayıcısı olan Dr. Holloway, 2.000\'den fazla hastanın daha düzgün bir gülüşe kavuşmasına yardımcı olmuştur.' },
      ]
    },
    testimonials: {
      tag:'Hasta Deneyimleri', h2:'Hastalarımız Ne Diyor?',
      desc:'Gülüşlerini bize emanet eden gerçek hastaların gerçek deneyimleri.',
      cards: [
        { quote:'"Yıllarca yoğun diş hekimi kaygısı yaşadım. Nova Diş\'teki ekip, ilk konsültasyondan itibaren kendimi tamamen rahat hissettirdi. Gülüş tasarımı sonucum hayal ettiğimin çok ötesinde — artık gülümsemekten kendimi alamıyorum."', role:'Gülüş Tasarımı Hastası' },
        { quote:'"Dr. Reid implant ameliyatımı gerçekleştirdi; tüm süreç ağrısız ve profesyoneldi. Takip bakımı son derece özenli oldu. Altı ay sonra implantım tamamen doğal hissettiriyor."', role:'İmplant Tedavisi Hastası' },
        { quote:'"Nova Diş bambaşka bir düzey. Klinik muhteşem, teknoloji etkileyici ve en önemlisi Dr. Vasquez ne istediğimi gerçekten dinledi. Dişlerim artık 8 ton daha beyaz ve mükemmel biçimde şekillendirildi."', role:'Beyazlatma & Veneer Hastası' },
        { quote:'"Oğlum burada 12 yaşında ortodonti tedavisine başladı. Dr. Holloway inanılmaz sabırlıydı ve tüm süreci onun için eğlenceli kıldı. İki yıl sonra sonuçtan daha mutlu olamazdık."', role:'Ortodonti (Veli)' },
        { quote:'"Dört yıldır yıllık kontrollerim için Nova Diş\'e geliyorum. Dijital tarama teknolojileri, önceki diş hekimimin yıllarca kaçırdığı bir sorunu erken yakaladı. Gerçek anlamda dünya standartlarında bir bakım."', role:'Düzenli Kontrol Hastası' },
        { quote:'"Kanal tedavisinden korku hikayeleri yüzünden çok çekiniyor dum, ancak ekip bunu tamamen ağrısız hale getirdi. İşlem yalnızca bir saat sürdü ve kliniği iyi hissederek terk ettim."', role:'Kanal Tedavisi Hastası' },
      ]
    },
    contact: {
      tag:'Bize Ulaşın', h2:'Randevunuzu Alın',
      desc:'Gülüşünüzü dönüştürmeye hazır mısınız? Bugün bizimle iletişime geçin; ekibimiz 24 saat içinde randevunuzu onaylamak için geri dönecektir.',
      phone:'Telefon', email:'E-posta', address:'Adres', hours:'Çalışma Saatleri',
      formTitle:'Randevu Talep Et',
      fields: { name:'Ad Soyad', phone:'Telefon Numarası', email:'E-posta Adresi', treatment:'İlgilenilen Tedavi', date:'Tercih Edilen Tarih', notes:'Ek Notlar' },
      placeholders: { name:'Ayşe Yılmaz', phone:'+90 (555) 000-0000', email:'ayse@ornek.com', notes:'Şikayetinizi veya özel gereksinimlerinizi bize anlatın…' },
      selectDefault:'Bir tedavi seçin…',
      treatmentOptions:['İmplant Tedavisi','Diş Beyazlatma','Gülüş Tasarımı','Ortodonti','Kanal Tedavisi','Diş Kontrolü','Diğer / Emin değilim'],
      submit:'Randevu Talebi Gönder',
      success:'Teşekkürler! Ekibimiz 24 saat içinde randevunuzu onaylamak için sizi arayacaktır.'
    },
    footer: {
      treatments:'Tedaviler', clinic:'Klinik', contact:'İletişim',
      copy:'© 2025 Nova Dental Kliniği. Tüm hakları saklıdır.'
    }
  }
};

/* ── APPLY TRANSLATIONS ─────────────────────────── */
let currentLang = 'en';

function applyLang(lang) {
  currentLang = lang;
  const t = T[lang];
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => document.querySelectorAll(s);

  // Nav
  const navLis = qsa('.nav-links li a');
  const navKeys = ['treatments','about','doctors','testimonials','contact'];
  navLis.forEach((a, i) => { if (navKeys[i]) a.textContent = t.nav[navKeys[i]]; });
  const navCta = qs('#nav-cta'); if (navCta) navCta.textContent = t.nav.cta;

  // Hero
  const heroBadge = qs('.hero-badge'); if (heroBadge) heroBadge.textContent = t.hero.badge;
  const heroH1 = qs('#hero h1'); if (heroH1) heroH1.innerHTML = t.hero.h1;
  const heroSub = qs('.hero-sub'); if (heroSub) heroSub.textContent = t.hero.sub;
  const heroCtas = qsa('#hero .hero-actions a');
  if (heroCtas[0]) heroCtas[0].textContent = t.hero.cta1;
  if (heroCtas[1]) heroCtas[1].textContent = t.hero.cta2;
  const statLabels = qsa('.hero-stats .stat-label');
  if (statLabels[0]) statLabels[0].textContent = t.hero.years;
  if (statLabels[1]) statLabels[1].textContent = t.hero.patients;
  if (statLabels[2]) statLabels[2].textContent = t.hero.satisfaction;

  // Trust bar
  const trustSpans = qsa('.trust-item span');
  const trustKeys = ['iso','sterilized','flexible','emergency'];
  trustSpans.forEach((s, i) => { if (trustKeys[i]) s.textContent = t.trust[trustKeys[i]]; });

  // Treatments section
  const tmEl = qs('#treatments');
  if (tmEl) {
    tmEl.querySelector('.section-tag').textContent = t.treatments.tag;
    tmEl.querySelector('h2').textContent = t.treatments.h2;
    tmEl.querySelector('.section-header p').textContent = t.treatments.desc;
    tmEl.querySelectorAll('.treatment-card').forEach((card, i) => {
      const c = t.treatments.cards[i]; if (!c) return;
      card.querySelector('h3').textContent = c.title;
      card.querySelector('p').textContent = c.desc;
      card.querySelector('.treatment-link').textContent = t.treatments.learnMore;
    });
  }

  // About
  const abEl = qs('#about');
  if (abEl) {
    abEl.querySelector('.section-tag').textContent = t.about.tag;
    abEl.querySelector('h2').textContent = t.about.h2;
    abEl.querySelector('.about-lead').textContent = t.about.lead;
    abEl.querySelector('.about-content > p:not(.about-lead)').textContent = t.about.para;
    abEl.querySelector('.about-badge-txt').textContent = t.about.badgeTxt;
    abEl.querySelectorAll('.about-list li').forEach((li, i) => {
      const textNode = [...li.childNodes].find(n => n.nodeType === 3);
      if (textNode) textNode.textContent = ' ' + t.about.list[i];
    });
    const abCta = abEl.querySelector('.btn-primary');
    if (abCta) abCta.textContent = t.about.cta;
  }

  // Doctors
  const drEl = qs('#doctors');
  if (drEl) {
    drEl.querySelector('.section-tag').textContent = t.doctors.tag;
    drEl.querySelector('h2').textContent = t.doctors.h2;
    drEl.querySelector('.section-header p').textContent = t.doctors.desc;
    drEl.querySelectorAll('.doctor-card').forEach((card, i) => {
      const c = t.doctors.cards[i]; if (!c) return;
      card.querySelector('.doctor-title').textContent = c.title;
      card.querySelector('.doctor-info p').textContent = c.bio;
    });
  }

  // Testimonials
  const tsEl = qs('#testimonials');
  if (tsEl) {
    tsEl.querySelector('.section-tag').textContent = t.testimonials.tag;
    tsEl.querySelector('h2').textContent = t.testimonials.h2;
    tsEl.querySelector('.section-header p').textContent = t.testimonials.desc;
    tsEl.querySelectorAll('.testimonial-card').forEach((card, i) => {
      const c = t.testimonials.cards[i]; if (!c) return;
      card.querySelector('p').textContent = c.quote;
      card.querySelector('.testimonial-author span').textContent = c.role;
    });
  }

  // Contact
  const ctEl = qs('#contact');
  if (ctEl) {
    ctEl.querySelector('.section-tag').textContent = t.contact.tag;
    ctEl.querySelector('h2').textContent = t.contact.h2;
    ctEl.querySelector('.contact-info > p').textContent = t.contact.desc;
    const contactItems = ctEl.querySelectorAll('.contact-item');
    const cKeys = ['phone','email','address','hours'];
    contactItems.forEach((item, i) => { const s = item.querySelector('strong'); if (s && cKeys[i]) s.textContent = t.contact[cKeys[i]]; });
    ctEl.querySelector('.appointment-form h3').textContent = t.contact.formTitle;
    // Labels
    const labels = ctEl.querySelectorAll('.form-group label');
    const lKeys = ['name','phone','email','treatment','date','notes'];
    labels.forEach((l, i) => { if (lKeys[i]) l.textContent = t.contact.fields[lKeys[i]]; });
    // Placeholders
    const nameInput = qs('#form-name'); if (nameInput) nameInput.placeholder = t.contact.placeholders.name;
    const phoneInput = qs('#form-phone'); if (phoneInput) phoneInput.placeholder = t.contact.placeholders.phone;
    const emailInput = qs('#form-email'); if (emailInput) emailInput.placeholder = t.contact.placeholders.email;
    const notesInput = qs('#form-message'); if (notesInput) notesInput.placeholder = t.contact.placeholders.notes;
    // Select options
    const sel = qs('#form-treatment');
    if (sel) {
      const opts = sel.querySelectorAll('option');
      opts[0].textContent = t.contact.selectDefault;
      t.contact.treatmentOptions.forEach((opt, i) => { if (opts[i+1]) opts[i+1].textContent = opt; });
    }
    // Submit
    const sub = qs('#form-submit'); if (sub) sub.textContent = t.contact.submit;
    // Success message
    const succ = qs('#form-success');
    if (succ) {
      const txt = succ.childNodes[succ.childNodes.length - 1];
      if (txt && txt.nodeType === 3) txt.textContent = ' ' + t.contact.success;
    }
  }

  // Footer
  const ftGroups = qsa('.footer-links-group h4');
  if (ftGroups[0]) ftGroups[0].textContent = t.footer.treatments;
  if (ftGroups[1]) ftGroups[1].textContent = t.footer.clinic;
  if (ftGroups[2]) ftGroups[2].textContent = t.footer.contact;
  const ftCopy = qs('#footer-copy'); if (ftCopy) ftCopy.textContent = t.footer.copy;

  // Update html lang attribute
  document.documentElement.lang = lang;

  // Sync widget language if loaded
  if (window.ClinicBridgeWidget?.setLang) window.ClinicBridgeWidget.setLang(lang);
}

/* ── LANGUAGE SWITCHER ──────────────────────────── */
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b === btn));
    applyLang(lang);
  });
});

// Also inject mobile lang switcher into mobile menu
function injectMobileLangSwitcher() {
  if (document.getElementById('mobile-lang')) return;
  const mobileSwitch = document.createElement('div');
  mobileSwitch.id = 'mobile-lang';
  mobileSwitch.style.cssText = 'display:flex;gap:6px;padding:14px 16px;border-top:1px solid #E2E8F0;margin-top:8px;';
  ['en','tr'].forEach(l => {
    const b = document.createElement('button');
    b.textContent = l.toUpperCase();
    b.style.cssText = `flex:1;padding:10px;border-radius:8px;border:1.5px solid ${currentLang===l?'#3B82F6':'#E2E8F0'};background:${currentLang===l?'#EFF6FF':'white'};color:${currentLang===l?'#2563EB':'#64748B'};font-weight:600;font-size:14px;cursor:pointer;`;
    b.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(x => x.classList.toggle('active', x.dataset.lang === l));
      applyLang(l);
      navLinks.classList.remove('mobile-open');
      // refresh mobile switcher
      document.getElementById('mobile-lang')?.remove();
    });
    mobileSwitch.appendChild(b);
  });
  navLinks.appendChild(mobileSwitch);
}
hamburger.addEventListener('click', () => {
  if (navLinks.classList.contains('mobile-open')) injectMobileLangSwitcher();
});

/* === SMOOTH SCROLL ACTIVE LINK === */
const sections = document.querySelectorAll('section[id]');
const navAnchors = document.querySelectorAll('.nav-links a');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navAnchors.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`);
      });
    }
  });
}, { threshold: 0.35 });
sections.forEach(s => observer.observe(s));

/* === FADE-IN ON SCROLL === */
const fadeEls = document.querySelectorAll('.treatment-card, .doctor-card, .testimonial-card, .about-inner, .contact-inner');
const fadeObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      fadeObs.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
fadeEls.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
  fadeObs.observe(el);
});
