import { resolveContactNumber } from "../lib/utils/contact-resolver";

const clinicBoth = {
  turkishContactNumber: "+90 533 140 08 70",
  internationalContactNumber: "+90 535 660 51 37",
  whatsappNumber: "+90 111 222 33 44",
};

const clinicLegacy = {
  whatsappNumber: "+90 999 888 77 66",
};

const tests = [
  // A. Turkish conversation
  {
    name: "A. Turkish conversation",
    clinic: clinicBoth,
    lang: "tr",
    expected: "+90 533 140 08 70",
  },
  // B. English conversation
  {
    name: "B. English conversation",
    clinic: clinicBoth,
    lang: "en",
    expected: "+90 535 660 51 37",
  },
  // E. Non-Turkish language such as German
  {
    name: "E. German conversation",
    clinic: clinicBoth,
    lang: "de",
    expected: "+90 535 660 51 37",
  },
  // F. International number is temporarily empty -> fallback to Turkish
  {
    name: "F. International empty fallback",
    clinic: {
      turkishContactNumber: "+90 533 140 08 70",
    },
    lang: "en",
    expected: "+90 533 140 08 70",
  },
  // Legacy fallback
  {
    name: "Legacy fallback (tr)",
    clinic: clinicLegacy,
    lang: "tr",
    expected: "+90 999 888 77 66",
  },
  {
    name: "Legacy fallback (en)",
    clinic: clinicLegacy,
    lang: "en",
    expected: "+90 999 888 77 66",
  }
];

let failed = false;

for (const t of tests) {
  const result = resolveContactNumber(t.clinic, t.lang);
  if (result === t.expected) {
    console.log(`[PASS] ${t.name}: expected ${t.expected}, got ${result}`);
  } else {
    console.error(`[FAIL] ${t.name}: expected ${t.expected}, but got ${result}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("All tests passed!");
}
