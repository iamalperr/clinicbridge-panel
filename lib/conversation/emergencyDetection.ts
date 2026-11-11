/**
 * Deterministic emergency detection (product-global, tr/en/de/fr/ar/ru).
 *
 * Input is the lower-cased patient message. Every term is matched as whole words with
 * Unicode-aware boundaries: plain \b treats letters such as ı, ş, é, ä, Cyrillic and Arabic
 * as non-word characters.
 *
 * Strong signals (acute phrasing, severity next to pain, bleeding that will not stop,
 * fever ≥ 39 °C, breathing / chest / fainting / anaphylaxis) always count. Weak signals
 * (bare "kanama", swelling of face/throat, rash after medication) are ignored when the
 * patient asks whether something is normal or expected.
 */

const S = "\\p{L}*";
const APOS = "['’]";
const L = "(?<![\\p{L}\\p{N}_])";
const R = "(?![\\p{L}\\p{N}_])";
/** Arabic conjunction prefixes (و / ف) attach directly to the following word. */
const AR = "(?:و|ف)?";

const group = (alternatives: readonly string[]) => `${L}(?:${alternatives.join("|")})${R}`;
const wholeWords = (alternatives: readonly string[]) => new RegExp(group(alternatives), "iu");
/** Both terms in either order, at most `gap` characters apart within one sentence. */
const near = (a: readonly string[], b: readonly string[], gap = 30) =>
  new RegExp(`${group(a)}[^.!?\\n]{0,${gap}}?${group(b)}|${group(b)}[^.!?\\n]{0,${gap}}?${group(a)}`, "iu");

const ACUTE_PHRASES = wholeWords([
  // tr
  "tıbbi acil", "tibbi acil",
  `kanamam(?:ız)? (?:var|durmuyor)`, `(?:çok|şiddetli|siddetli|durmayan) kanama${S}`, "çok kanıyor",
  "nefes alamıyorum", "nefes alamiyorum", `nefes al${S} (?:zorlan|güçlük)${S}`, `nefes darlığı${S}`,
  "nefesim daralıyor", "yutkunamıyorum", "yutamıyorum", `yutkunmakta zorlan${S}`, "boğazım kapanıyor",
  `yüksek ateş${S}`, `ateş${S} (?:çok )?yüksek`,
  `göğ(?:üs|süm|sümde) (?:bir )?(?:ağrı|sıkış|bask)${S}`, "göğsüm ağrıyor",
  "nefesim kesiliyor", "kalbim sıkışıyor",
  "bayılma", "bayilma", "bayılıyorum", "bayılacak gibi", `baygınlık${S}`,
  "(?:sonra|ardından|önce|ve) bayıldım", "kendimden geçtim",
  `alerjik reaksiyon${S}`, `alerji(?:k)? (?:oldu|yaptı|krizi${S})`, "alerjim tuttu", `anafilak${S}`, `kurdeşen${S}`,
  // en
  "heavy bleeding", "severe bleeding", "bleeding (?:a lot|heavily|badly|nonstop|non-stop)",
  `can${APOS}?t (?:breathe|swallow)`, "cannot (?:breathe|swallow)", "(?:barely|hardly) (?:breathe|swallow)",
  `can${APOS}?t (?:catch my breath|get (?:any |enough )?air)`,
  "chest (?:feels |is )?(?:really |very |so )?tight", "passing out",
  "(?:difficulty|trouble|struggling) (?:breathing|swallowing|to breathe|to swallow)",
  "hard to (?:breathe|swallow)", "short(?:ness)? of breath", "throat (?:is )?closing",
  "high fever", "high temperature",
  `chest pain${S}`, "pain in (?:my|the) chest", "chest (?:hurts|is tight|tightness)", "tightness in (?:my|the) chest",
  "fainting", "fainted", "passed out", "lost consciousness", "blacked out",
  "(?:going|about) to faint", `feel${S} faint`,
  "allergic reaction", `anaphyla${S}`, "hives",
  // de
  `blute${S} (?:sehr )?(?:stark|immer noch|ununterbrochen)`, `stark${S} blutung${S}`,
  "atemnot", "atembeschwerden", "schluckbeschwerden",
  "kann (?:nicht|kaum) (?:atmen|schlucken)", "(?:bekomme|kriege) (?:keine|schlecht|kaum) luft",
  "probleme beim (?:atmen|schlucken)",
  `hoh${S} fieber`,
  `brustschmerz${S}`, `schmerz${S} in der brust`,
  "ohnmächtig", "ohnmaechtig", "ohnmacht", "bewusstlos", "kollabiert", "umgekippt", "zusammengebrochen",
  `allergisch${S} (?:reaktion|schock)${S}`, `anaphylak${S}`, "nesselsucht",
  // fr
  `saigne${S} (?:beaucoup|abondamment|énormément)`, `saignement${S} (?:abondant|important|fort)${S}`,
  `hémorragie${S}`,
  `j${APOS}ai (?:atrocement|terriblement|horriblement) mal`,
  "(?:du mal|de la peine|des difficultés|difficulté) à (?:respirer|avaler)",
  `n${APOS}arrive pas à (?:respirer|avaler)`, "ne peux pas (?:respirer|avaler)",
  "respire (?:difficilement|mal)", `j${APOS}étouffe`, `essouffl${S}`,
  "(?:du mal|de la peine) à reprendre (?:mon|son) souffle", "souffle court",
  `oppression${S} (?:dans la |à la )?(?:poitrine|thoracique)`, "(?:fais|fait|eu|faire) un malaise",
  "forte fièvre", "fièvre (?:élevée|forte|très forte)",
  `douleur${S} thoracique${S}`, "mal à la poitrine", `douleur${S} (?:à|dans) la poitrine`,
  `évanoui${S}`, "perdu connaissance", "perte de connaissance",
  `réaction${S} allergique${S}`, "choc anaphylactique", `anaphyla${S}`, "urticaire",
  // ar
  `${AR}نزيف (?:شديد|حاد|غزير|مستمر)`,
  `${AR}صعوبة (?:في )?(?:ال)?(?:تنفس|بلع)`, `${AR}ضيق (?:في )?(?:ال)?تنفس`,
  `${AR}لا أستطيع (?:ال)?(?:تنفس|بلع)`, `${AR}(?:ما|لا) (?:أقدر|اقدر) (?:أتنفس|اتنفس|أبلع|ابلع)`,
  `${AR}(?:ال)?(?:حرارة|حمى|سخونة) (?:عالية|مرتفعة|شديدة)`, `${AR}ارتفاع (?:في )?(?:ال)?حرارة`,
  `${AR}(?:ألم|الم|وجع) (?:في |ب)?(?:ال)?صدر`, `${AR}(?:ألم|الم) صدري`,
  `${AR}(?:أ|ا)غمي علي`, `${AR}فقدت (?:ال)?وعي`, `${AR}(?:إ|ا)غماء`,
  `${AR}(?:رد فعل|تفاعل) تحسسي`, `${AR}صدمة تحسسية`, `${AR}حساسية شديدة`, `${AR}(?:ال)?شرى`,
  // ru
  `сильн${S} кровотечени${S}`, `сильно кровоточ${S}`,
  "(?:трудно|тяжело) (?:дышать|глотать)", "не могу (?:дышать|глотать)", `задыха${S}`, `одышк${S}`,
  `затруднен${S} дыхани${S}`, "не хватает воздуха", `давит (?:в )?груд${S}`,
  `высок${S} температур${S}`,
  "бол(?:ь|и|ью) в груди", `болит (?:в )?груд${S}`,
  `потерял${S} сознани${S}`, `теряю сознани${S}`, `обморок${S}`,
  `аллергическ${S} (?:реакци|шок)${S}`, `анафилак${S}`, "от[её]к квинке", `крапивниц${S}`,
]);

const PAIN = [
  `(?:ağrı|agri|sızı)${S}`, "pain", `schmerz${S}`, `douleur${S}`, "mal",
  "бол(?:ь|и|ью|ей)", `${AR}(?:ب|ال|بال)?(?:ألم|الم|وجع)`,
];
const SEVERE = [
  "dayanılmaz", "dayanilmaz", "katlanılmaz", "şiddetli", "siddetli", `katlanam${S}`, `dayanam${S}`,
  "unbearable", "excruciating", "severe", "agonizing", "extreme", "terrible", "intense",
  "so bad", `can${APOS}?t stand`,
  `unerträglich${S}`, `unertraeglich${S}`, `höllisch${S}`, `heftig${S}`, `stark${S}`, `extrem${S}`,
  `insupportable${S}`, `intolérable${S}`, `atroce${S}`, "très forte",
  `невыносим${S}`, `адск${S}`, `ужасн${S}`, `сильн${S}`, `остр${S}`,
  "لا (?:يطاق|يحتمل|تحتمل|تطاق)", "شديد(?:ة)?", "فظيع(?:ة)?", "حاد(?:ة)?",
];
const BLEED = [
  `kanama${S}`, "kan", `bleed${S}`, "blood", `blut${S}`, `saign${S}`, "sang",
  `кров${S}`, `${AR}(?:ال)?(?:نزيف|دم)`,
];
const NOT_STOPPING = [
  "durmuyor", "dinmiyor", "kesilmiyor", "sürekli",
  `(?:won${APOS}?t|will not|doesn${APOS}?t|does not|hasn${APOS}?t|has not|can${APOS}?t|cannot) stop${S}`, `keeps? (?:coming|going|bleeding)`,
  `(?:not|isn${APOS}?t|is not) stopping`,
  "(?:hört|hoert) (?:\\p{L}+ )?nicht auf", "nicht aufhören",
  `(?:ne )?s${APOS}arrête pas`, `n${APOS}arrête pas`, "sans arrêt",
  "не (?:останавливается|прекращается|останавливаются)",
  "(?:ما|لا) (?:وقف|يتوقف|يوقف|توقف)", "مستمر",
];
const FEVER = [
  `ateş${S}`, "fever", "temperature", `fieber${S}`, "fièvre", `температур${S}`, `${AR}(?:ال)?(?:حرار|حمى)${S}`,
];
const FEVER_39_PLUS = [
  `(?:39|4[0-2])(?:[.,]\\d)?(?:\\s*(?:°|derece|grad|degrees?|градус${S}))?`, "(?:٣٩|٤[٠-٢])", "10[2-6](?:[.,]\\d)?\\s*°?\\s*f",
];

const STRONG_RULES: readonly RegExp[] = [
  ACUTE_PHRASES,
  near(SEVERE, PAIN, 20),
  near(BLEED, NOT_STOPPING, 40),
  near(FEVER, FEVER_39_PLUS, 25),
];

const SWELLING = wholeWords([
  `şiş${S}`, `swell${S}`, "swollen", `(?:an)?geschwollen${S}`, `schwellung${S}`, `anschwell${S}`, `schwill${S}`,
  `gonfl${S}`, `enfl${S}`, `опух${S}`, `от[её]к${S}`, `${AR}(?:ال)?(?:منتفخ|تورم|انتفاخ)${S}`,
]);
const FACE_THROAT = wholeWords([
  "yüz", `yüzü${S}`, `boğaz${S}`, `dudağ${S}`, `dudak${S}`, "dilim", `yanağ${S}`, `yanak${S}`,
  "face", "throat", "tongue", "lips?", "cheeks?", "jaw",
  `gesicht${S}`, "hals", `wange${S}`, "zunge", `lippe${S}`,
  "visage", "gorge", `joue${S}`, "langue", `lèvre${S}`,
  `лиц${S}`, `горл${S}`, `щ[её]к${S}`, `губ${S}`, "язык",
  `${AR}(?:ال|بال)?(?:وجه|حلق|لسان|شفة|شفاه|شفت|خد)${S}`,
]);
const RASH = wholeWords([
  `kaşın${S}`, "kızarıklık", `döküntü${S}`, "rash", `ausschlag${S}`, "plaques", "boutons", "сыпь", "طفح",
]);
const MEDICATION = wholeWords([
  `ilaç${S}`, `antibiyotik${S}`, `medication${S}`, `antibiotic${S}`, "amoxicillin", "penicillin",
  `medikament${S}`, `antibiotik${S}`, `médicament${S}`, `antibiotique${S}`,
  `лекарств${S}`, `антибиотик${S}`, `${AR}(?:ال)?دواء`, "مضاد حيوي", "المضاد الحيوي",
]);

const WEAK_RULES: readonly ((lower: string) => boolean)[] = [
  (lower) => wholeWords(["kanama"]).test(lower),
  (lower) => SWELLING.test(lower) && FACE_THROAT.test(lower),
  (lower) => RASH.test(lower) && MEDICATION.test(lower),
];

/** "Is some swelling normal?", "İmplanttan sonra şişlik olur mu?" — expected side-effect questions. */
const EXPECTED_SIDE_EFFECT_QUESTION = wholeWords([
  "normal", "olur mu", "olacak mı", "olursa", "will i", "will there", "should i expect",
  "est-ce normal", "нормально ли", "будет ли", "طبيعي", "طبيعية",
  `risk${S}`, `risiko${S}`, `risque${S}`, `риск${S}`, `${AR}(?:ال)?خطر${S}`,
]);

/** Generic "emergency" wording, except when it is about booking or contact details. */
const GENERIC = wholeWords([
  "medical emergency",
  "emergency(?!\\s+(?:appointments?|bookings?|slots?|visits?|numbers?|contacts?|lines?|hours|dentists?|services?)(?![\\p{L}]))",
  "notfall",
  "urgence (?:vitale|médicale)", `c${APOS}est une urgence`,
  `${AR}حالة (?:طارئة|طوارئ)`,
  "скорую", `неотложн${S} помощ${S}`,
]);

const ACIL = wholeWords(["acil"]);
const ACIL_NON_CLINICAL = wholeWords(["acil\\s*(?:yetkili|temsilci|dönüş|donus|cevap|arama|destek|biri|durumlar)"]);
const ACIL_CLINICAL_CONTEXT = wholeWords(["ağrı", "agri", "kanama", "hastane", "doktor", "ambulans", "durum", "tedavi"]);

export function isEmergencyMessage(lower: string): boolean {
  if (STRONG_RULES.some((rule) => rule.test(lower))) return true;
  if (!EXPECTED_SIDE_EFFECT_QUESTION.test(lower) && WEAK_RULES.some((rule) => rule(lower))) return true;
  if (GENERIC.test(lower)) return true;
  if (ACIL_NON_CLINICAL.test(lower)) return false;
  return ACIL.test(lower) && ACIL_CLINICAL_CONTEXT.test(lower);
}
