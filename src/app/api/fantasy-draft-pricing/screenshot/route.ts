import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getServerProPlotAccess } from "@/lib/access/pro-access-server"

export const dynamic = "force-dynamic"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const DEFAULT_MODEL = "gpt-5-mini"
const MAX_IMAGE_COUNT = 2
const MAX_DATA_URL_LENGTH = 800_000

interface ScreenshotInput {
  name?: unknown
  dataUrl?: unknown
}

interface OpenAiResponseOutputContent {
  type?: string
  text?: string
}

interface OpenAiResponseOutputItem {
  type?: string
  content?: OpenAiResponseOutputContent[]
}

interface OpenAiResponsePayload {
  output?: OpenAiResponseOutputItem[]
  output_text?: string
}

function getOpenAiApiKey(): string | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  return apiKey && apiKey.length > 0 ? apiKey : null
}

function getOpenAiModel(): string {
  const configured = process.env.OPENAI_RESPONSES_MODEL?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_MODEL
}

function isImageDataUrl(value: string): boolean {
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(value)
}

function extractAssistantText(payload: OpenAiResponsePayload): string {
  if (typeof payload.output_text === "string") return payload.output_text
  const parts: string[] = []
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        parts.push(content.text)
      }
    }
  }
  return parts.join("\n").trim()
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("AI response did not contain JSON.")
    return JSON.parse(match[0])
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!(await getServerProPlotAccess(userId))) {
      return NextResponse.json({ error: "Sign up to Pro to use NRL AI screenshot autofill." }, { status: 403 })
    }

    const apiKey = getOpenAiApiKey()
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 })
    }

    const body = (await request.json().catch(() => null)) as { images?: ScreenshotInput[] } | null
    const images = Array.isArray(body?.images) ? body.images.slice(0, MAX_IMAGE_COUNT) : []
    const validImages = images.flatMap((image, index) => {
      const dataUrl = typeof image.dataUrl === "string" ? image.dataUrl.trim() : ""
      if (!dataUrl || dataUrl.length > MAX_DATA_URL_LENGTH || !isImageDataUrl(dataUrl)) return []
      return [{
        name: typeof image.name === "string" && image.name.trim() ? image.name.trim() : `screenshot-${index + 1}`,
        dataUrl,
      }]
    })

    if (validImages.length === 0) {
      return NextResponse.json({ error: "Upload one or two PNG, JPEG, or WebP screenshots." }, { status: 400 })
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        reasoning: { effort: "low" },
        instructions: [
          "Extract NRL Fantasy Draft matchup data from screenshots.",
          "The screenshots show two teams side by side. The left column is home; the right column is away.",
          "Read the team names and every visible player name. Include starting side and bench players.",
          "Use the section headers to assign slots: HOK, MID, EDG, HLF, CTR, WFB, BEN.",
          "If a player has a captain badge, set isCaptain true.",
          "Return JSON only in this exact shape: {\"home\":{\"teamName\":\"\",\"ownerName\":\"\",\"players\":[{\"name\":\"\",\"slot\":\"HOK\",\"isBench\":false,\"isCaptain\":false}]},\"away\":{\"teamName\":\"\",\"ownerName\":\"\",\"players\":[{\"name\":\"\",\"slot\":\"HOK\",\"isBench\":false,\"isCaptain\":false}]}}.",
          "Keep abbreviated names exactly as visible, for example J. Tedesco. Do not include scores, positions, team abbreviations, or injury symbols in the name.",
          "Do not invent missing players. If only one screenshot is supplied, return only the players visible there.",
        ].join("\n"),
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract the NRL Fantasy matchup teams from these screenshots as JSON only.",
            },
            ...validImages.map((image) => ({
              type: "input_image",
              image_url: image.dataUrl,
              detail: "high",
            })),
          ],
        }],
        max_output_tokens: 1400,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "")
      return NextResponse.json(
        { error: "Failed to process screenshots.", details: errorText.slice(0, 500) },
        { status: response.status }
      )
    }

    const payload = (await response.json()) as OpenAiResponsePayload
    const extracted = parseJsonObject(extractAssistantText(payload))
    return NextResponse.json({ extracted })
  } catch (error) {
    console.error("Error extracting fantasy draft screenshots:", error)
    return NextResponse.json(
      { error: "Failed to process screenshots.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
