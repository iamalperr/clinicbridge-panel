const WIDGET_SCRIPT_URL =
  process.env.NEXT_PUBLIC_WIDGET_SCRIPT_URL ||
  "https://widget.clinicbridge-ai.com/widget.js";

/** Same snippet the clinic widget page copies onto a website. */
export function buildWidgetEmbedCode(
  clinicId: string,
  defaultLanguage: "auto" | "tr" | "en" = "auto",
  scriptUrl: string = WIDGET_SCRIPT_URL
): string {
  const langAttr = defaultLanguage === "tr"
    ? ` data-language="tr"`
    : defaultLanguage === "en"
      ? ` data-language="en"`
      : "";
  return `<script\n  src="${scriptUrl}"\n  data-clinic-id="${clinicId}"${langAttr}\n  async>\n</script>`;
}
