"use client"

import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from "react"
import JSZip from "jszip"
import { toast } from "sonner"
import { meditationPads } from "@/scripts/update-meditation-pads"

interface AudioData {
  id: string
  name: string
  audioBlob?: Blob
  speed: number
  balance: number
  echoDelay?: number
  echoFeedback?: number
  volume?: number
  color?: string
  loop?: boolean
}

interface SerializedAudioData {
  id: string
  name: string
  audioDataUrl?: string
  speed: number
  balance: number
  echoDelay?: number
  echoFeedback?: number
  volume?: number
  color?: string
  loop?: boolean
}

interface AudioContextType {
  audioData: Record<string, AudioData>
  updateAudioData: (id: string, data: Partial<AudioData>) => void
  playAudio: (id: string) => void
  isPlaying: Record<string, boolean>
  saveData: () => void
  exportData: () => Promise<void>
  importData: (file: File) => Promise<void>
  isEditMode: boolean
  setIsEditMode: (editMode: boolean) => void
  buttonOrder: string[]
  reorderButtons: (fromIndex: number, toIndex: number) => void
  outputDeviceId: string
  setOutputDeviceId: (id: string) => void
  availableOutputDevices: MediaDeviceInfo[]
}

const AudioContext = createContext<AudioContextType | undefined>(undefined)

const STORAGE_KEY = "sound-pad-mixer-data"
const ORDER_STORAGE_KEY = "sound-pad-mixer-order"

const saveToLocalStorage = async (audioData: Record<string, AudioData>) => {
  try {
    const serializedData: Record<string, SerializedAudioData> = {}

    for (const [id, data] of Object.entries(audioData)) {
      const serialized: SerializedAudioData = {
        id: data.id,
        name: data.name,
        speed: data.speed,
        balance: data.balance,
        echoDelay: data.echoDelay,
        echoFeedback: data.echoFeedback,
        volume: data.volume,
        color: data.color,
        loop: data.loop,
      }

      if (data.audioBlob) {
        // Convert blob to data URL for storage
        const reader = new FileReader()
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(data.audioBlob!)
        })
        serialized.audioDataUrl = dataUrl
      }

      serializedData[id] = serialized
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializedData))
  } catch (error) {
    console.error("Error saving to localStorage:", error)
  }
}

const loadFromLocalStorage = async (): Promise<Record<string, AudioData>> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}

    const serializedData: Record<string, SerializedAudioData> = JSON.parse(stored)
    const audioData: Record<string, AudioData> = {}

    for (const [id, data] of Object.entries(serializedData)) {
      const audioItem: AudioData = {
        id: data.id,
        name: data.name,
        speed: data.speed,
        balance: data.balance,
        echoDelay: data.echoDelay,
        echoFeedback: data.echoFeedback,
        volume: data.volume,
        color: data.color,
        loop: data.loop,
      }

      if (data.audioDataUrl) {
        // Convert data URL back to blob
        const response = await fetch(data.audioDataUrl)
        audioItem.audioBlob = await response.blob()
      }

      audioData[id] = audioItem
    }

    return audioData
  } catch (error) {
    console.error("Error loading from localStorage:", error)
    return {}
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const [audioData, setAudioData] = useState<Record<string, AudioData>>({})
  const [isPlaying, setIsPlaying] = useState<Record<string, boolean>>({})
  const [isEditMode, setIsEditMode] = useState(false)
  const [buttonOrder, setButtonOrder] = useState<string[]>(Array.from({ length: 36 }, (_, i) => (i + 1).toString()))
  const [outputDeviceId, setOutputDeviceIdState] = useState<string>('')
  const [availableOutputDevices, setAvailableOutputDevices] = useState<MediaDeviceInfo[]>([])

  const setOutputDeviceId = (deviceId: string) => {
    setOutputDeviceIdState(deviceId)
    localStorage.setItem('sound-pad-mixer-output-device', deviceId)
  }
  const audioInstancesRefs = useRef<Record<string, HTMLAudioElement[]>>({})
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioNodesRef = useRef<
    Record<string, { source: MediaElementAudioSourceNode; panNode: StereoPannerNode; gainNode: GainNode }[]>
  >({})
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const resourceCountRef = useRef({ audioElements: 0, audioNodes: 0, objectUrls: 0 })
  const cachedAudioRef = useRef<Record<string, { audio: HTMLAudioElement; url: string }>>({})

  const performPeriodicCleanup = () => {
    // Count current resources
    let totalAudioElements = 0
    let totalAudioNodes = 0

    Object.values(audioInstancesRefs.current).forEach((instances) => {
      totalAudioElements += instances.length
    })

    Object.values(audioNodesRef.current).forEach((nodes) => {
      totalAudioNodes += nodes.length
    })

    resourceCountRef.current = {
      audioElements: totalAudioElements,
      audioNodes: totalAudioNodes,
      objectUrls: resourceCountRef.current.objectUrls,
    }

    // Force cleanup if resources are excessive
    if (totalAudioElements > 50 || totalAudioNodes > 50) {
      forceCleanupAllAudio()
    }

    // Recreate AudioContext if it's in a bad state
    if (audioContextRef.current && audioContextRef.current.state === "closed") {
      audioContextRef.current = null
    }
  }

  const forceCleanupAllAudio = () => {
    Object.values(cachedAudioRef.current).forEach(({ audio, url }) => {
      try {
        audio.pause()
        audio.currentTime = 0
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error("Error cleaning up cached audio:", error)
      }
    })
    cachedAudioRef.current = {}

    // Stop all audio instances
    Object.entries(audioInstancesRefs.current).forEach(([id, instances]) => {
      instances.forEach((audio) => {
        try {
          audio.pause()
          audio.currentTime = 0
          URL.revokeObjectURL(audio.src)
        } catch (error) {
          console.error("Error cleaning up audio:", error)
        }
      })
      audioInstancesRefs.current[id] = []
    })

    // Disconnect all audio nodes
    Object.entries(audioNodesRef.current).forEach(([id, nodes]) => {
      nodes.forEach((nodeSet) => {
        try {
          nodeSet.source.disconnect()
          nodeSet.panNode.disconnect()
          nodeSet.gainNode.disconnect()
        } catch (error) {
          console.error("Error disconnecting nodes:", error)
        }
      })
      audioNodesRef.current[id] = []
    })

    // Reset playing states
    setIsPlaying({})

    // Reset resource counter
    resourceCountRef.current = { audioElements: 0, audioNodes: 0, objectUrls: 0 }
  }

  useEffect(() => {
    const loadData = async () => {
      const savedData = await loadFromLocalStorage()
      const hasSavedData = Object.keys(savedData).length > 0

      const updatedData: Record<string, AudioData> = {}

      for (let i = 1; i <= 36; i++) {
        const id = i.toString()
        const meditationConfig = meditationPads[id]
        const existingData = hasSavedData ? savedData[id] : undefined

        updatedData[id] = {
          id,
          name: existingData?.name || meditationConfig?.name || `Pad ${id}`,
          speed: existingData?.speed || 1,
          balance: existingData?.balance ?? meditationConfig?.balance ?? 0,
          echoDelay: existingData?.echoDelay ?? meditationConfig?.echoDelay ?? 0.1,
          echoFeedback: existingData?.echoFeedback ?? meditationConfig?.echoFeedback ?? 0,
          volume: existingData?.volume ?? meditationConfig?.volume ?? 0.75,
          color: existingData?.color || meditationConfig?.color,
          loop: existingData?.loop,
          audioBlob: existingData?.audioBlob,
        }
      }

      setAudioData(updatedData)

      const savedOrder = localStorage.getItem(ORDER_STORAGE_KEY)
      if (savedOrder) {
        try {
          const order = JSON.parse(savedOrder)
          if (Array.isArray(order) && order.length === 36) {
            setButtonOrder(order)
          }
        } catch (error) {
          console.error("Error loading button order:", error)
        }
      }
    }
    loadData()

    cleanupIntervalRef.current = setInterval(performPeriodicCleanup, 5 * 60 * 1000)

    setTimeout(performPeriodicCleanup, 30000)

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current)
      }
      forceCleanupAllAudio()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    // Load persisted output device
    const savedDevice = localStorage.getItem('sound-pad-mixer-output-device')
    if (savedDevice) setOutputDeviceIdState(savedDevice)

    // Enumerate audio output devices
    const refreshDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAvailableOutputDevices(devices.filter(d => d.kind === 'audiooutput'))
    }
    refreshDevices()
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  }, [])

  useEffect(() => {
    if (Object.keys(audioData).length > 0) {
      saveToLocalStorage(audioData)
    }
  }, [audioData])

  useEffect(() => {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(buttonOrder))
  }, [buttonOrder])

  const updateAudioData = (id: string, data: Partial<AudioData>) => {
    if (cachedAudioRef.current[id]) {
      const { audio, url } = cachedAudioRef.current[id]
      try {
        audio.pause()
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error("Error cleaning up cached audio:", error)
      }
      delete cachedAudioRef.current[id]
    }

    setAudioData((prev) => {
      const updated = {
        ...prev,
        [id]: {
          id,
          name: data.name || prev[id]?.name || `Pad ${id}`, // Preserve original name if not updated
          speed: data.speed !== undefined ? data.speed : prev[id]?.speed || 1,
          balance: data.balance !== undefined ? data.balance : prev[id]?.balance || 0,
          echoDelay:
            data.echoDelay !== undefined
              ? data.echoDelay
              : prev[id]?.echoDelay !== undefined
                ? prev[id].echoDelay
                : 0.1,
          echoFeedback: data.echoFeedback !== undefined ? data.echoFeedback : prev[id]?.echoFeedback || 0,
          volume: data.volume !== undefined ? data.volume : prev[id]?.volume || 0.75,
          color: data.color !== undefined ? data.color : prev[id]?.color,
          loop: data.loop !== undefined ? data.loop : prev[id]?.loop,
          audioBlob: data.audioBlob !== undefined ? data.audioBlob : prev[id]?.audioBlob,
        },
      }

      return updated
    })
  }

  const cleanupAudioNodes = (id: string, audio: HTMLAudioElement) => {
    const nodes = audioNodesRef.current[id]
    if (nodes) {
      const nodeIndex = nodes.findIndex((nodeSet) => {
        try {
          // Try to identify the node set by checking if source is connected to the audio element
          return nodeSet.source.mediaElement === audio
        } catch {
          return false
        }
      })

      if (nodeIndex > -1) {
        const nodeSet = nodes[nodeIndex]
        try {
          nodeSet.source.disconnect()
          nodeSet.panNode.disconnect()
          nodeSet.gainNode.disconnect()
        } catch (error) {
          console.error("Error disconnecting audio nodes:", error)
        }
        nodes.splice(nodeIndex, 1)
        resourceCountRef.current.audioNodes = Math.max(0, resourceCountRef.current.audioNodes - 1)
      }
    }
  }

  const limitAudioInstances = (id: string, maxInstances = 8) => {
    const instances = audioInstancesRefs.current[id]
    if (instances && instances.length >= maxInstances) {
      // Stop and cleanup oldest instances
      const instancesToRemove = instances.splice(0, instances.length - maxInstances + 1)
      instancesToRemove.forEach((audio) => {
        audio.pause()
        cleanupAudioNodes(id, audio)
        if (audio.src && audio.src.startsWith("blob:")) {
          URL.revokeObjectURL(audio.src)
          resourceCountRef.current.objectUrls = Math.max(0, resourceCountRef.current.objectUrls - 1)
        }
        resourceCountRef.current.audioElements = Math.max(0, resourceCountRef.current.audioElements - 1)
      })
    }
  }

  const playAudio = async (id: string) => {
    const data = audioData[id]

    if (!data?.audioBlob) return

    // If loop is enabled and already playing, clicking again stops it
    if (data.loop && isPlaying[id]) {
      if (cachedAudioRef.current[id]) {
        cachedAudioRef.current[id].audio.pause()
        cachedAudioRef.current[id].audio.currentTime = 0
      }
      setIsPlaying(prev => ({ ...prev, [id]: false }))
      return
    }

    limitAudioInstances(id)

    if (!audioContextRef.current) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        audioContextRef.current = new AudioContext()
      } catch (error) {
        console.error("Error creating AudioContext:", error)
        return
      }
    }

    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume()
      } catch (error) {
        console.error("Error resuming AudioContext:", error)
      }
    }

    const needsWebAudio =
      data.balance !== 0 || (data.volume || 1) > 1 || ((data.echoDelay || 0) > 0 && (data.echoFeedback || 0) > 0)

    // Disable echo when loop is enabled — echo path doesn't support looping
    const hasEcho = !data.loop && (data.echoDelay || 0) > 0 && (data.echoFeedback || 0) > 0

    if (hasEcho) {
      const echoCount = Math.min(Math.floor((data.echoFeedback || 0) * 6) + 3, 6)
      const delayMs = Math.max((data.echoDelay || 0) * 1000, 100)

      for (let i = 0; i <= echoCount; i++) {
        const url = URL.createObjectURL(data.audioBlob)
        const echoAudio = new Audio(url)
        if (outputDeviceId && 'setSinkId' in HTMLAudioElement.prototype) {
          try { await (echoAudio as any).setSinkId(outputDeviceId) } catch {}
        }
        resourceCountRef.current.objectUrls++

        const delay = i * delayMs
        let volume: number
        if (i === 0) {
          volume = data.volume || 1
        } else {
          const baseEchoVolume = (data.volume || 1) * 0.6 // Start echoes at 60% of original
          const decayFactor = Math.pow(data.echoFeedback || 0.5, i - 1) // Use feedback as decay rate
          volume = baseEchoVolume * decayFactor
        }

        echoAudio.playbackRate = data.speed
        echoAudio.volume = Math.min(volume, 1)

        if (audioContextRef.current && audioContextRef.current.state === "running") {
          try {
            const audioContext = audioContextRef.current

            const source = audioContext.createMediaElementSource(echoAudio)
            const panNode = audioContext.createStereoPanner()
            const gainNode = audioContext.createGain()

            panNode.pan.value = data.balance || 0
            gainNode.gain.value = volume > 1 ? volume : 1

            source.connect(panNode)
            panNode.connect(gainNode)
            gainNode.connect(audioContext.destination)

            if (!audioNodesRef.current[id]) {
              audioNodesRef.current[id] = []
            }
            audioNodesRef.current[id].push({ source, panNode, gainNode })
            resourceCountRef.current.audioNodes++
          } catch (error) {
            console.error("Error applying audio effects to echo:", error)
          }
        }

        if (!audioInstancesRefs.current[id]) {
          audioInstancesRefs.current[id] = []
        }
        audioInstancesRefs.current[id].push(echoAudio)
        resourceCountRef.current.audioElements++

        setTimeout(async () => {
          try {
            await echoAudio.play()
          } catch (error) {
            console.error("Error playing echo audio:", error)
          }
        }, delay)

        echoAudio.onended = () => {
          cleanupAudioNodes(id, echoAudio)
          const instances = audioInstancesRefs.current[id]
          if (instances) {
            const index = instances.indexOf(echoAudio)
            if (index > -1) {
              instances.splice(index, 1)
              resourceCountRef.current.audioElements = Math.max(0, resourceCountRef.current.audioElements - 1)
            }
            if (instances.length === 0) {
              setIsPlaying((prev) => ({ ...prev, [id]: false }))
            }
          }
          if (echoAudio.src && echoAudio.src.startsWith("blob:")) {
            URL.revokeObjectURL(echoAudio.src)
            resourceCountRef.current.objectUrls = Math.max(0, resourceCountRef.current.objectUrls - 1)
          }
        }
      }

      setIsPlaying((prev) => ({ ...prev, [id]: true }))
      return
    }

    let audio: HTMLAudioElement
    let isNewAudio = false

    if (cachedAudioRef.current[id]) {
      audio = cachedAudioRef.current[id].audio
      audio.currentTime = 0 // Reset to beginning
    } else {
      // Create new cached audio element
      const url = URL.createObjectURL(data.audioBlob)
      audio = new Audio(url)
      cachedAudioRef.current[id] = { audio, url }
      isNewAudio = true
      resourceCountRef.current.objectUrls++
    }

    audio.playbackRate = data.speed
    audio.volume = Math.min(data.volume || 1, 1)
    audio.loop = data.loop || false
    if (outputDeviceId && 'setSinkId' in HTMLAudioElement.prototype) {
      try { await (audio as any).setSinkId(outputDeviceId) } catch {}
    }

    if (needsWebAudio && audioContextRef.current && isNewAudio) {
      try {
        const audioContext = audioContextRef.current

        if (audioContext.state === "running") {
          const source = audioContext.createMediaElementSource(audio)
          const panNode = audioContext.createStereoPanner()
          const gainNode = audioContext.createGain()

          panNode.pan.value = data.balance || 0
          gainNode.gain.value = (data.volume || 1) > 1 ? data.volume || 1 : 1

          source.connect(panNode)
          panNode.connect(gainNode)
          gainNode.connect(audioContext.destination)

          if (!audioNodesRef.current[id]) {
            audioNodesRef.current[id] = []
          }
          audioNodesRef.current[id].push({ source, panNode, gainNode })
          resourceCountRef.current.audioNodes++
        }
      } catch (error) {
        console.error("Error applying audio effects:", error)
      }
    }

    if (!audioInstancesRefs.current[id]) {
      audioInstancesRefs.current[id] = []
    }

    audioInstancesRefs.current[id].push(audio)
    if (isNewAudio) {
      resourceCountRef.current.audioElements++
    }

    setIsPlaying((prev) => ({ ...prev, [id]: true }))

    audio.onended = () => {
      const instances = audioInstancesRefs.current[id]
      if (instances) {
        const index = instances.indexOf(audio)
        if (index > -1) {
          instances.splice(index, 1)
        }
        if (instances.length === 0) {
          setIsPlaying((prev) => ({ ...prev, [id]: false }))
        }
      }
      if (audio.src && audio.src.startsWith("blob:")) {
        URL.revokeObjectURL(audio.src)
        resourceCountRef.current.objectUrls = Math.max(0, resourceCountRef.current.objectUrls - 1)
      }
      cleanupAudioNodes(id, audio)
    }

    try {
      await audio.play()
    } catch (error) {
      if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        try {
          await audioContextRef.current.resume()
          await audio.play()
        } catch (retryError) {
          console.error("Audio playback failed:", retryError)
        }
      } else {
        console.error("Audio playback failed:", error)
      }
    }
  }

  const saveData = () => {
    saveToLocalStorage(audioData)
  }

  const exportData = async () => {
    try {
      const zip = new JSZip()
      let audioFileCount = 0
      let totalPadsWithSettings = 0

      // Create settings object with all pad data
      const settings: Record<string, any> = {}

      for (const [id, data] of Object.entries(audioData)) {
        totalPadsWithSettings++
        settings[id] = {
          id: data.id,
          name: data.name,
          speed: data.speed,
          balance: data.balance,
          echoDelay: data.echoDelay,
          echoFeedback: data.echoFeedback,
          volume: data.volume,
          color: data.color,
          loop: data.loop,
          hasAudio: !!data.audioBlob,
        }

        // Add audio file if it exists
        if (data.audioBlob) {
          zip.file(`pad-${id}.webm`, data.audioBlob)
          audioFileCount++
        }
      }

      // Add button order
      settings._buttonOrder = buttonOrder
      settings._metadata = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        totalPads: 36,
        padsWithAudio: audioFileCount,
        padsWithSettings: totalPadsWithSettings,
      }

      // Add settings.json
      zip.file("settings.json", JSON.stringify(settings, null, 2))

      // Generate zip file
      const blob = await zip.generateAsync({ type: "blob" })

      // Download the file
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `sound-pad-mixer-${new Date().toISOString().split("T")[0]}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Exported ${audioFileCount} audio files`)
    } catch (error) {
      console.error("Error exporting data:", error)
      toast.error(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }

  const importData = async (file: File) => {
    try {
      // Validate file type
      if (!file.name.endsWith(".zip")) {
        throw new Error("Invalid file type. Please select a .zip file.")
      }

      const zip = await JSZip.loadAsync(file)

      // Read settings.json
      const settingsFile = zip.file("settings.json")
      if (!settingsFile) {
        throw new Error("Invalid export file: settings.json not found")
      }

      const settingsText = await settingsFile.async("text")
      const settings = JSON.parse(settingsText)

      // Validate settings structure
      if (!settings || typeof settings !== "object") {
        throw new Error("Invalid settings.json format")
      }

      // Restore button order if it exists
      if (settings._buttonOrder && Array.isArray(settings._buttonOrder)) {
        setButtonOrder(settings._buttonOrder)
      }

      // Restore audio data
      const newAudioData: Record<string, AudioData> = {}
      let importedAudioCount = 0
      let importedSettingsCount = 0
      let missingAudioCount = 0

      for (let i = 1; i <= 36; i++) {
        const id = i.toString()
        const padSettings = settings[id]

        if (padSettings) {
          importedSettingsCount++
          newAudioData[id] = {
            id,
            name: padSettings.name || `Pad ${id}`,
            speed: padSettings.speed || 1,
            balance: padSettings.balance || 0,
            echoDelay: padSettings.echoDelay !== undefined ? padSettings.echoDelay : 0.1,
            echoFeedback: padSettings.echoFeedback || 0,
            volume: padSettings.volume !== undefined ? padSettings.volume : 0.75,
            color: padSettings.color,
            loop: padSettings.loop,
          }

          // Load audio file if it exists
          if (padSettings.hasAudio) {
            const audioFile = zip.file(`pad-${id}.webm`)
            if (audioFile) {
              const audioBlob = await audioFile.async("blob")
              newAudioData[id].audioBlob = audioBlob
              importedAudioCount++
            } else {
              missingAudioCount++
            }
          }
        } else {
          // Create default data for pads not in the export
          newAudioData[id] = {
            id,
            name: `Pad ${id}`,
            speed: 1,
            balance: 0,
            echoDelay: 0.1,
            echoFeedback: 0,
            volume: 0.75,
          }
        }
      }

      // Clear cached audio before setting new data
      Object.values(cachedAudioRef.current).forEach(({ audio, url }) => {
        try {
          audio.pause()
          audio.currentTime = 0
          URL.revokeObjectURL(url)
        } catch (error) {
          console.error("Error cleaning up cached audio:", error)
        }
      })
      cachedAudioRef.current = {}

      setAudioData(newAudioData)

      // Save to localStorage
      await saveToLocalStorage(newAudioData)

      toast.success(`Imported ${importedAudioCount} audio files${missingAudioCount > 0 ? ` (${missingAudioCount} missing)` : ''}`)
    } catch (error) {
      console.error("Error importing data:", error)
      toast.error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }

  const reorderButtons = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return

    const newOrder = [...buttonOrder]
    const [movedItem] = newOrder.splice(fromIndex, 1)
    newOrder.splice(toIndex, 0, movedItem)

    const fromId = buttonOrder[fromIndex]
    const toId = buttonOrder[toIndex]

    // Get the audio data for both positions
    const fromData = audioData[fromId]
    const toData = audioData[toId]

    // Swap the audio data while preserving the IDs
    setAudioData((prev) => ({
      ...prev,
      [fromId]: {
        ...toData,
        id: fromId,
        name: toData?.name ? (toData.name.startsWith("Pad ") ? `Pad ${fromId}` : toData.name) : `Pad ${fromId}`,
      },
      [toId]: {
        ...fromData,
        id: toId,
        name: fromData?.name ? (fromData.name.startsWith("Pad ") ? `Pad ${toId}` : fromData.name) : `Pad ${toId}`,
      },
    }))

    setButtonOrder(newOrder)
  }

  return (
    <AudioContext.Provider
      value={{
        audioData,
        updateAudioData,
        playAudio,
        isPlaying,
        saveData,
        exportData,
        importData,
        isEditMode,
        setIsEditMode,
        buttonOrder,
        reorderButtons,
        outputDeviceId,
        setOutputDeviceId,
        availableOutputDevices,
      }}
    >
      {children}
    </AudioContext.Provider>
  )
}

export function useAudio() {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider")
  }
  return context
}
