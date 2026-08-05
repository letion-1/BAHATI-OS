import { getOpenAIClient } from "@/lib/ai/client";
import { inquiryExtractionInstructions } from "@/lib/ai/prompts/inquiry";
import {
  inquiryExtractionSchema,
  type ExtractedInquiry,
} from "@/lib/ai/schemas/inquiry";

export async function extractInquiry(
  inquiryText: string
): Promise<ExtractedInquiry> {
  const cleanedText = inquiryText.trim();

  if (cleanedText.length < 20) {
    throw new Error("Please provide a fuller inquiry message.");
  }

  const client = getOpenAIClient();

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5",
    store: false,
    instructions: inquiryExtractionInstructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Extract this yacht charter inquiry:\n\n${cleanedText}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "yacht_charter_inquiry",
        description:
          "Structured information extracted from a yacht charter inquiry.",
        strict: true,
        schema: inquiryExtractionSchema,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("The AI returned no extractable result.");
  }

  try {
    return JSON.parse(response.output_text) as ExtractedInquiry;
  } catch {
    throw new Error("The AI returned invalid structured data.");
  }
}
