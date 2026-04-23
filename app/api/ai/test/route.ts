import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { messages, userMessage, settings, patientConsent } = await req.json();

    if (patientConsent !== true) {
      return NextResponse.json(
        { error: "KVKK onayı olmadan AI hizmeti kullanılamaz." },
        { status: 403 }
      );
    }

    if (!settings || (!userMessage && !messages)) {
      return NextResponse.json(
        { error: "settings and either userMessage or messages are required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Prepare System Instruction
    const systemInstruction = settings.systemPrompt 
      ? `${settings.systemPrompt}\n\nIMPORTANT: If the user asks to book an appointment (e.g., "randevu almak istiyorum"), you MUST respond in valid JSON format exactly like this:\n{ "message": "Your response text here...", "quickReplies": ["Option 1", "Option 2", "Option 3"] }\nOtherwise, just respond normally in plain text.`
      : "You are a helpful assistant.";

    // Build the messages array for OpenAI
    // We favor the full 'messages' array if provided by the client (stateful chat)
    const chatHistory = messages && Array.isArray(messages) 
      ? messages.map((m: any) => ({ role: m.role, content: m.content }))
      : [{ role: "user", content: userMessage }];

    const completion = await openai.chat.completions.create({
      model: settings.model || "gpt-4o",
      temperature: settings.temperature !== undefined ? settings.temperature : 0.7,
      messages: [
        {
          role: "system",
          content: systemInstruction,
        },
        ...chatHistory,
      ],
    });

    const aiMessage = completion.choices[0]?.message?.content;

    if (!aiMessage) {
      throw new Error("Empty response from OpenAI");
    }

    // Attempt to parse structured response
    let responsePayload = { message: aiMessage };
    try {
      const parsed = JSON.parse(aiMessage);
      if (parsed && typeof parsed === "object" && parsed.message) {
        responsePayload = {
          message: parsed.message,
          ...(parsed.quickReplies && Array.isArray(parsed.quickReplies) ? { quickReplies: parsed.quickReplies } : {})
        };
      }
    } catch (e) {
      // Not JSON, which is fine
    }

    return NextResponse.json(responsePayload);

  } catch (error: any) {
    console.error("OpenAI API Error details:", error.response?.data || error.message || error);
    
    const errorMessage = error.response?.data?.error?.message 
      || error.message 
      || "An unexpected error occurred while contacting OpenAI.";

    return NextResponse.json(
      { error: "Failed to generate AI response.", details: errorMessage },
      { status: 500 }
    );
  }
}
