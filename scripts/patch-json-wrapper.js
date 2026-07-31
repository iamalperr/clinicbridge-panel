const fs = require("fs");
const path = require("path");

const routePath = path.join(__dirname, "../app/api/public/agency/[slug]/matching-chat/route.ts");
let code = fs.readFileSync(routePath, "utf-8");

if (!code.includes("saveConversationStateAsync")) {
  code = `import { saveConversationStateAsync } from "@/lib/services/conversationHelper";\n` + code;
}

// 1. Inject jsonResponse definition right after `const { message, action, history = [], sessionContext = {} } = body;`
const injectPoint = "const { message, action, history = [], sessionContext = {} } = body;";
const injectCode = `
    const jsonResponse = (respBody: any, init?: any) => {
      try {
        if (respBody && respBody.sessionContext && typeof agencyId !== "undefined") {
          saveConversationStateAsync(agencyId, respBody.sessionContext, history, respBody.reply, respBody.type).catch(console.error);
        }
      } catch(e) {}
      return NextResponse.json(respBody, init);
    };
`;

if (!code.includes("const jsonResponse =")) {
  code = code.replace(injectPoint, injectPoint + "\n" + injectCode);
}

// 2. Replace all `NextResponse.json(` with `jsonResponse(` ONLY INSIDE the POST function.
// Since all NextResponse.json inside this file are inside POST (or we want them all wrapped anyway),
// we can safely replace them.
// But wait, there are error responses early on where `agencyId` isn't defined yet. Our jsonResponse checks `typeof agencyId !== "undefined"` so it's perfectly safe!

code = code.replace(/NextResponse\.json\(/g, "jsonResponse(");

fs.writeFileSync(routePath, code);
console.log("Successfully patched route.ts with jsonResponse wrapper.");
