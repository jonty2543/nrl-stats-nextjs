import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const DEFAULT_MODEL = "gpt-5-mini"
const MAX_IMAGE_COUNT = 3
const MAX_DATA_URL_LENGTH = 1_900_000

interface ScreenshotInput {
  name?: unknown
  dataUrl?: unknown
}

interface ValidScreenshotInput {
  name: string
  dataUrl: string
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

function openAiErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } }
    if (typeof parsed.error?.message === "string" && parsed.error.message.trim()) {
      return parsed.error.message.trim()
    }
  } catch {
    // Fall back to raw text below.
  }
  return text.trim()
}

function hasExtractedPlayers(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const players = (value as { players?: unknown }).players
  return Array.isArray(players) && players.length > 0
}

async function requestScreenshotExtraction(
  apiKey: string,
  validImages: ValidScreenshotInput[],
  retryEmptyPlayers: boolean,
): Promise<{ response: Response; extracted?: unknown }> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
      reasoning: { effort: retryEmptyPlayers ? "medium" : "low" },
      instructions: [
        "Extract one NRL Fantasy classic My Team squad from screenshots.",
        "The screenshots may show the top of the team, lower starters, bench, emergencies, the key, and a trade screen.",
        "Read the team name, visible round, every visible player name, position row, and markers.",
        "Player names are the labels directly under the circular player photos. They are often abbreviated, for example O. Pascoe, S. Utoikamanu, or R. Couchman.",
        "If any player labels are visible, include them. Do not return an empty players array unless there are no readable player labels in any uploaded My Team screenshot.",
        retryEmptyPlayers
          ? "The previous pass found no players. Re-check the small text labels under each player image and extract any readable abbreviations. A partial abbreviated name is better than returning no players."
          : "",
        "If a trade screen is included, read total trades remaining, bank remaining, and trades available this week.",
        "For trades, distinguish the values carefully: in displays like '(15)3' or '(15)3/2', tradesRemaining is 15 and tradesAvailableThisWeek is 3. Ignore the trailing weekly allowance such as '2 this week' or '/2'.",
        "Starting position rows are HOK, MID, EDG, HLF, CTR, and WFB. Bench rows can be INT and EMG.",
        "Use squadRole starter for players on the field, interchange for INT bench players, and emergency for EMG bench players.",
        "Set benchOrder when a visible INT/EMG number appears. Set isCaptain for C, isViceCaptain for V, isBye for BYE, and status uncertain for yellow question mark, injured for red cross/plus, suspended for red dot.",
        "Return JSON only in this exact shape: {\"teamName\":\"\",\"round\":\"\",\"tradesRemaining\":\"\",\"bankRemaining\":\"\",\"tradesAvailableThisWeek\":\"\",\"players\":[{\"name\":\"\",\"slot\":\"HOK\",\"squadRole\":\"starter\",\"benchOrder\":null,\"isCaptain\":false,\"isViceCaptain\":false,\"isBye\":false,\"status\":null}]}",
        "Keep abbreviated names exactly as visible, for example J. Hughes. Do not include scores, clubs, or marker text in the name.",
        "Return clean trade values as plain numbers where possible, for example tradesRemaining '15' and tradesAvailableThisWeek '3'. Keep bank values exactly as visible, for example $123k.",
        "Do not invent missing players. If a player label is partly truncated but the visible text is still readable, include the visible abbreviated label exactly as shown.",
      ].filter(Boolean).join("\n"),
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: retryEmptyPlayers
              ? "Retry extraction. Focus only on visible player-name labels under the player photos and return JSON only."
              : "Extract the NRL Fantasy My Team squad from these screenshots as JSON only.",
          },
          ...validImages.map((image) => ({
            type: "input_image",
            image_url: image.dataUrl,
            detail: "high",
          })),
        ],
      }],
      max_output_tokens: 3000,
    }),
  })

  if (!response.ok) return { response }
  const payload = (await response.json()) as OpenAiResponsePayload
  return { response, extracted: parseJsonObject(extractAssistantText(payload)) }
}

export async function POST(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: "Upload one to three PNG, JPEG, or WebP screenshots." }, { status: 400 })
    }

    let extraction = await requestScreenshotExtraction(apiKey, validImages, false)
    if (extraction.response.ok && !hasExtractedPlayers(extraction.extracted)) {
      extraction = await requestScreenshotExtraction(apiKey, validImages, true)
    }

    if (!extraction.response.ok) {
      const errorText = await extraction.response.text().catch(() => "")
      const details = openAiErrorMessage(errorText)
      return NextResponse.json(
        { error: "Failed to process screenshots.", details: details.slice(0, 500) },
        { status: extraction.response.status }
      )
    }

    return NextResponse.json({ extracted: extraction.extracted })
  } catch (error) {
    console.error("Error extracting fantasy My Team screenshots:", error)
    return NextResponse.json(
      { error: "Failed to process screenshots.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
