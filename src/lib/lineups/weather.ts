import type { LineupMatch } from "@/lib/lineups/nrl-lineups"

export interface LineupWeatherForecast {
  matchId: string
  venue: string
  location: string
  provider: "Open-Meteo"
  forecastTimeUtc: string
  condition: string
  temperatureC: number | null
  apparentTemperatureC: number | null
  precipitationProbabilityPct: number | null
  precipitationMm: number | null
  windKmh: number | null
  gustKmh: number | null
}

interface StadiumLocation {
  name: string
  latitude: number
  longitude: number
  aliases: string[]
}

interface OpenMeteoHourly {
  time?: unknown[]
  weather_code?: unknown[]
  temperature_2m?: unknown[]
  apparent_temperature?: unknown[]
  precipitation_probability?: unknown[]
  precipitation?: unknown[]
  wind_speed_10m?: unknown[]
  wind_gusts_10m?: unknown[]
}

interface OpenMeteoForecast {
  hourly?: OpenMeteoHourly
}

const MAX_FORECAST_DAYS = 16

const STADIUM_LOCATIONS: StadiumLocation[] = [
  { name: "Accor Stadium", latitude: -33.8472, longitude: 151.0634, aliases: ["accor stadium", "stadium australia"] },
  { name: "AAMI Park", latitude: -37.825, longitude: 144.9834, aliases: ["aami park"] },
  { name: "Allianz Stadium", latitude: -33.8891, longitude: 151.2253, aliases: ["allianz stadium", "sydney football stadium"] },
  { name: "Apollo Projects Stadium", latitude: -43.5453, longitude: 172.6203, aliases: ["apollo projects stadium", "christchurch stadium"] },
  { name: "Belmore Sports Ground", latitude: -33.916, longitude: 151.0885, aliases: ["belmore sports ground", "belmore"] },
  { name: "BlueBet Stadium", latitude: -33.758, longitude: 150.6868, aliases: ["bluebet stadium", "penrith stadium"] },
  { name: "Cbus Super Stadium", latitude: -28.0063, longitude: 153.3678, aliases: ["cbus super stadium", "robina stadium"] },
  { name: "Central Coast Stadium", latitude: -33.4273, longitude: 151.3427, aliases: ["central coast stadium", "industree group stadium"] },
  { name: "CommBank Stadium", latitude: -33.8082, longitude: 150.9996, aliases: ["commbank stadium", "western sydney stadium"] },
  { name: "Dolphin Stadium", latitude: -27.2247, longitude: 153.105, aliases: ["dolphin stadium", "kayo stadium"] },
  { name: "Eden Park", latitude: -36.875, longitude: 174.7447, aliases: ["eden park"] },
  { name: "FMG Stadium Waikato", latitude: -37.7788, longitude: 175.2678, aliases: ["fmg stadium waikato", "waikato stadium"] },
  { name: "GIO Stadium", latitude: -35.2504, longitude: 149.1037, aliases: ["gio stadium", "canberra stadium"] },
  { name: "Go Media Stadium", latitude: -36.9182, longitude: 174.8122, aliases: ["go media stadium", "mount smart stadium", "mt smart stadium"] },
  { name: "HBF Park", latitude: -31.9456, longitude: 115.8698, aliases: ["hbf park", "perth rectangular stadium"] },
  { name: "Leichhardt Oval", latitude: -33.8797, longitude: 151.1567, aliases: ["leichhardt oval"] },
  { name: "McDonald Jones Stadium", latitude: -32.9188, longitude: 151.7266, aliases: ["mcdonald jones stadium", "newcastle stadium"] },
  { name: "Netstrata Jubilee Stadium", latitude: -33.9806, longitude: 151.1358, aliases: ["netstrata jubilee stadium", "jubilee stadium", "kogarah oval"] },
  { name: "Optus Stadium", latitude: -31.951, longitude: 115.889, aliases: ["optus stadium", "perth stadium"] },
  { name: "PointsBet Stadium", latitude: -34.0418, longitude: 151.1392, aliases: ["pointsbet stadium", "endeavour field", "shark park"] },
  { name: "Queensland Country Bank Stadium", latitude: -19.2636, longitude: 146.8179, aliases: ["queensland country bank stadium", "qcb stadium"] },
  { name: "Scully Park", latitude: -31.1025, longitude: 150.9174, aliases: ["scully park"] },
  { name: "Sky Stadium", latitude: -41.2733, longitude: 174.7859, aliases: ["sky stadium", "wellington regional stadium"] },
  { name: "Suncorp Stadium", latitude: -27.4648, longitude: 153.0095, aliases: ["suncorp stadium", "lang park"] },
  { name: "TIO Stadium", latitude: -12.3993, longitude: 130.8876, aliases: ["tio stadium", "marrara stadium"] },
  { name: "WIN Stadium", latitude: -34.4258, longitude: 150.9025, aliases: ["win stadium", "wollongong stadium"] },
  { name: "4 Pines Park", latitude: -33.7865, longitude: 151.2697, aliases: ["4 pines park", "brookvale oval", "lottoland"] },
]

function normaliseVenue(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function stadiumForVenue(venue: string | null): StadiumLocation | null {
  if (!venue) return null
  const key = normaliseVenue(venue)
  if (!key) return null

  return (
    STADIUM_LOCATIONS.find((stadium) =>
      stadium.aliases.some((alias) => {
        const aliasKey = normaliseVenue(alias)
        return key === aliasKey || key.includes(aliasKey)
      })
    ) ?? null
  )
}

function weatherCodeLabel(code: number | null): string {
  if (code == null) return "Forecast"
  if (code === 0) return "Clear"
  if (code === 1) return "Mostly clear"
  if (code === 2) return "Partly cloudy"
  if (code === 3) return "Cloudy"
  if (code === 45 || code === 48) return "Fog"
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle"
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain"
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow"
  if ([95, 96, 99].includes(code)) return "Storm"
  return "Forecast"
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function forecastDaysForKickoff(kickoff: Date): number | null {
  const now = new Date()
  const days = Math.ceil((kickoff.getTime() - now.getTime()) / 86_400_000) + 1
  if (days < 1 || days > MAX_FORECAST_DAYS) return null
  return days
}

function nearestHourlyIndex(times: unknown[] | undefined, kickoff: Date): number | null {
  if (!times?.length) return null
  let bestIndex: number | null = null
  let bestDiff = Number.POSITIVE_INFINITY

  times.forEach((value, index) => {
    const time = stringValue(value)
    if (!time) return
    const parsed = Date.parse(/(?:z|[+-]\d{2}:?\d{2})$/i.test(time) ? time : `${time}Z`)
    if (!Number.isFinite(parsed)) return
    const diff = Math.abs(parsed - kickoff.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      bestIndex = index
    }
  })

  return bestDiff <= 90 * 60 * 1000 ? bestIndex : null
}

async function fetchWeatherForMatch(match: LineupMatch): Promise<LineupWeatherForecast | null> {
  const stadium = stadiumForVenue(match.venue)
  if (!stadium || !match.kickoffUtc || !match.venue) return null

  const kickoff = new Date(match.kickoffUtc)
  if (!Number.isFinite(kickoff.getTime())) return null

  const forecastDays = forecastDaysForKickoff(kickoff)
  if (!forecastDays) return null

  const params = new URLSearchParams({
    latitude: String(stadium.latitude),
    longitude: String(stadium.longitude),
    hourly: [
      "weather_code",
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "wind_speed_10m",
      "wind_gusts_10m",
    ].join(","),
    timezone: "UTC",
    wind_speed_unit: "kmh",
    forecast_days: String(forecastDays),
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    next: { revalidate: 30 * 60 },
  })
  if (!response.ok) return null

  const data = (await response.json()) as OpenMeteoForecast
  const hourly = data.hourly
  const index = nearestHourlyIndex(hourly?.time, kickoff)
  if (index == null) return null

  const forecastTime = stringValue(hourly?.time?.[index])
  return {
    matchId: match.matchId,
    venue: match.venue,
    location: stadium.name,
    provider: "Open-Meteo",
    forecastTimeUtc: forecastTime ? `${forecastTime.replace(/Z$/, "")}Z` : match.kickoffUtc,
    condition: weatherCodeLabel(numericValue(hourly?.weather_code?.[index])),
    temperatureC: numericValue(hourly?.temperature_2m?.[index]),
    apparentTemperatureC: numericValue(hourly?.apparent_temperature?.[index]),
    precipitationProbabilityPct: numericValue(hourly?.precipitation_probability?.[index]),
    precipitationMm: numericValue(hourly?.precipitation?.[index]),
    windKmh: numericValue(hourly?.wind_speed_10m?.[index]),
    gustKmh: numericValue(hourly?.wind_gusts_10m?.[index]),
  }
}

export async function fetchLineupWeatherForecasts(matches: LineupMatch[]): Promise<Record<string, LineupWeatherForecast>> {
  try {
    const forecasts = await Promise.all(matches.map((match) => fetchWeatherForMatch(match).catch(() => null)))
    return Object.fromEntries(
      forecasts
        .filter((forecast): forecast is LineupWeatherForecast => forecast != null)
        .map((forecast) => [forecast.matchId, forecast])
    )
  } catch (error) {
    console.warn("Unable to fetch lineup weather forecasts.", error)
    return {}
  }
}
