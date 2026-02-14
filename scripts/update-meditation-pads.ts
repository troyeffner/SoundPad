// Default pad configuration

interface PadConfig {
  name: string
  color: string
  volume: number
  balance: number
  echoDelay: number
  echoFeedback: number
}

// Row colors
const rowColors = ["slate", "rose", "blue", "green", "amber", "slate"]

// Generate default empty pads
const meditationPads: Record<string, PadConfig> = {}
for (let i = 1; i <= 36; i++) {
  const row = Math.floor((i - 1) / 6)
  meditationPads[i.toString()] = {
    name: `Pad ${i}`,
    color: rowColors[row],
    volume: 0.75,
    balance: 0,
    echoDelay: 0.1,
    echoFeedback: 0,
  }
}

export { meditationPads }
export type { PadConfig }
