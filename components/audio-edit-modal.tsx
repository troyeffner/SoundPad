"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Mic, Square, Play, Trash2, Repeat } from "lucide-react"
import { useAudio } from "./audio-provider"

interface AudioEditModalProps {
  isOpen: boolean
  onClose: () => void
  padId: string
  currentData?: {
    id: string
    name: string
    audioBlob?: Blob
    speed: number
    balance?: number
    echoDelay?: number
    echoFeedback?: number
    volume?: number
    color?: string
    loop?: boolean
  }
}

export function AudioEditModal({ isOpen, onClose, padId, currentData }: AudioEditModalProps) {
  const { updateAudioData } = useAudio()
  const [isRecording, setIsRecording] = useState(false)
  const [name, setName] = useState(currentData?.name || `Pad ${padId}`)
  const [speed, setSpeed] = useState(currentData?.speed || 1)
  const [balance, setBalance] = useState(currentData?.balance || 0)
  const [echoDelay, setEchoDelay] = useState(currentData?.echoDelay || 0)
  const [echoFeedback, setEchoFeedback] = useState(currentData?.echoFeedback || 0)
  const [volume, setVolume] = useState(currentData?.volume || 1)
  const [color, setColor] = useState(currentData?.color || "slate")
  const [loop, setLoop] = useState(currentData?.loop || false)
  const [audioBlob, setAudioBlob] = useState<Blob | undefined>(currentData?.audioBlob)
  const [isPlaying, setIsPlaying] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (isOpen) {
      setName(currentData?.name || `Pad ${padId}`)
      setSpeed(currentData?.speed || 1)
      setBalance(currentData?.balance || 0)
      setEchoDelay(currentData?.echoDelay || 0)
      setEchoFeedback(currentData?.echoFeedback || 0)
      setVolume(currentData?.volume || 1)
      setColor(currentData?.color || "slate")
      setLoop(currentData?.loop || false)
      setAudioBlob(currentData?.audioBlob)
    }
  }, [isOpen, currentData, padId])

  const trimSilence = async (audioBlob: Blob): Promise<Blob> => {
    return new Promise((resolve) => {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const fileReader = new FileReader()

      fileReader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          const channelData = audioBuffer.getChannelData(0)
          const sampleRate = audioBuffer.sampleRate
          const threshold = 0.005 // More sensitive silence threshold

          // Find the first non-silent sample
          let startSample = 0
          for (let i = 0; i < channelData.length; i++) {
            if (Math.abs(channelData[i]) > threshold) {
              startSample = i
              break
            }
          }

          // If no silence detected, still trim first 100ms to remove any recording artifacts
          if (startSample === 0 && channelData.length > sampleRate * 0.1) {
            startSample = Math.floor(sampleRate * 0.1)
          }

          // If no significant trimming needed, return original
          if (startSample < sampleRate * 0.05) {
            // Less than 50ms
            resolve(audioBlob)
            return
          }

          console.log(`Trimming ${((startSample / sampleRate) * 1000).toFixed(0)}ms of leading silence`)

          // Create new buffer without leading silence
          const trimmedLength = channelData.length - startSample
          const trimmedBuffer = audioContext.createBuffer(audioBuffer.numberOfChannels, trimmedLength, sampleRate)

          // Copy audio data without leading silence
          for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const originalData = audioBuffer.getChannelData(channel)
            const trimmedData = trimmedBuffer.getChannelData(channel)
            for (let i = 0; i < trimmedLength; i++) {
              trimmedData[i] = originalData[i + startSample]
            }
          }

          // Convert back to blob
          const wavBlob = bufferToWav(trimmedBuffer)
          console.log(
            `Trimmed audio from ${(audioBuffer.length / sampleRate).toFixed(2)}s to ${(trimmedBuffer.length / sampleRate).toFixed(2)}s`,
          )
          resolve(wavBlob)
        } catch (error) {
          console.error("Error trimming silence:", error)
          resolve(audioBlob) // Return original on error
        }
      }

      fileReader.readAsArrayBuffer(audioBlob)
    })
  }

  const bufferToWav = (buffer: AudioBuffer): Blob => {
    const length = buffer.length
    const numberOfChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2)
    const view = new DataView(arrayBuffer)

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, "RIFF")
    view.setUint32(4, 36 + length * numberOfChannels * 2, true)
    writeString(8, "WAVE")
    writeString(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numberOfChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numberOfChannels * 2, true)
    view.setUint16(32, numberOfChannels * 2, true)
    view.setUint16(34, 16, true)
    writeString(36, "data")
    view.setUint32(40, length * numberOfChannels * 2, true)

    // Convert float samples to 16-bit PCM
    let offset = 44
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]))
        view.setInt16(offset, sample * 0x7fff, true)
        offset += 2
      }
    }

    return new Blob([arrayBuffer], { type: "audio/wav" })
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/wav" })
        // Trim leading silence from the recording
        const trimmedBlob = await trimSilence(blob)
        setAudioBlob(trimmedBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("Error starting recording:", error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const playPreview = async () => {
    if (!audioBlob) return

    if (audioRef.current) {
      URL.revokeObjectURL(audioRef.current.src)
      audioRef.current.pause()
      audioRef.current = null
    }

    const audio = new Audio(URL.createObjectURL(audioBlob))
    audio.playbackRate = speed
    audio.volume = Math.min(volume, 1)
    audioRef.current = audio

    if ("webkitAudioContext" in window || "AudioContext" in window) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        const audioContext = new AudioContext()
        const source = audioContext.createMediaElementSource(audio)
        const panNode = audioContext.createStereoPanner()
        const gainNode = audioContext.createGain()

        if (echoDelay > 0) {
          const delayNode = audioContext.createDelay(2.0)
          const feedbackNode = audioContext.createGain()
          const wetGainNode = audioContext.createGain()

          delayNode.delayTime.value = echoDelay
          feedbackNode.gain.value = echoFeedback
          wetGainNode.gain.value = 0.3

          source.connect(delayNode)
          delayNode.connect(feedbackNode)
          feedbackNode.connect(delayNode)
          delayNode.connect(wetGainNode)
          wetGainNode.connect(panNode)
        }

        panNode.pan.value = balance
        gainNode.gain.value = volume
        source.connect(panNode)
        panNode.connect(gainNode)
        gainNode.connect(audioContext.destination)
      } catch (error) {
        console.error("Error applying audio effects:", error)
      }
    }

    setIsPlaying(true)
    audio.onended = () => {
      setIsPlaying(false)
      URL.revokeObjectURL(audio.src)
    }

    try {
      await audio.play()
    } catch (error) {
      console.error("Error playing preview:", error)
      setIsPlaying(false)
    }
  }

  const handleSave = () => {
    updateAudioData(padId, {
      name,
      speed,
      balance,
      echoDelay,
      echoFeedback,
      volume,
      color,
      loop,
      audioBlob,
    })
    onClose()
  }

  const handleDelete = () => {
    updateAudioData(padId, {
      name: `Pad ${padId}`,
      speed: 1,
      balance: 0,
      echoDelay: 0,
      echoFeedback: 0,
      volume: 1,
      color: "slate",
      loop: false,
      audioBlob: undefined,
    })
    onClose()
  }

  const getBalanceLabel = (value: number) => {
    if (value === 0) return "Center"
    if (value < 0) return `Left ${Math.abs(value * 100).toFixed(0)}%`
    return `Right ${(value * 100).toFixed(0)}%`
  }

  const colorOptions = [
    { value: "slate", label: "Slate", class: "bg-slate-300" },
    { value: "rose", label: "Rose", class: "bg-rose-300" },
    { value: "blue", label: "Blue", class: "bg-blue-300" },
    { value: "green", label: "Green", class: "bg-green-300" },
    { value: "amber", label: "Amber", class: "bg-amber-300" },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Sound Pad {padId}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Pad Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Pad ${padId}`} />
          </div>

          <div className="space-y-3">
            <Label>Button Color</Label>
            <div className="flex gap-2">
              {colorOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setColor(option.value)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${option.class} ${
                    color === option.value ? "border-ring scale-110" : "border-border hover:scale-105"
                  }`}
                  title={option.label}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Audio Recording</Label>
            <div className="flex gap-2">
              {!isRecording ? (
                <Button onClick={startRecording} className="flex-1">
                  <Mic className="w-4 h-4 mr-2" />
                  Start Recording
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="destructive" className="flex-1">
                  <Square className="w-4 h-4 mr-2" />
                  Stop Recording
                </Button>
              )}

              {audioBlob && (
                <Button onClick={playPreview} variant="outline" disabled={isPlaying}>
                  <Play className="w-4 h-4" />
                </Button>
              )}
            </div>

            {isRecording && (
              <div className="text-sm text-muted-foreground text-center">Recording... Click stop when finished</div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Volume: {(volume * 100).toFixed(0)}%</Label>
            <Slider
              value={[volume]}
              onValueChange={(value) => setVolume(value[0])}
              min={0}
              max={2}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0%</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Playback Speed: {speed}x</Label>
            <Slider
              value={[speed]}
              onValueChange={(value) => setSpeed(value[0])}
              min={0.25}
              max={2}
              step={0.25}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.25x</span>
              <span>1x</span>
              <span>2x</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Balance: {getBalanceLabel(balance)}</Label>
            <Slider
              value={[balance]}
              onValueChange={(value) => setBalance(value[0])}
              min={-1}
              max={1}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Left</span>
              <span>Center</span>
              <span>Right</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Echo Delay: {echoDelay === 0 ? "Off" : `${(echoDelay * 1000).toFixed(0)}ms`}</Label>
            <Slider
              value={[echoDelay]}
              onValueChange={(value) => setEchoDelay(value[0])}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Off</span>
              <span>500ms</span>
              <span>1000ms</span>
            </div>
          </div>

          {echoDelay > 0 && (
            <div className="space-y-3">
              <Label>Echo Fade Out: {(echoFeedback * 100).toFixed(0)}%</Label>
              <Slider
                value={[echoFeedback]}
                onValueChange={(value) => setEchoFeedback(value[0])}
                min={0}
                max={0.8}
                step={0.05}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Quick Fade</span>
                <span>Medium</span>
                <span>Long Fade</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="loop-toggle" className="flex items-center gap-2 cursor-pointer">
              <Repeat className="w-4 h-4 text-muted-foreground" />
              Loop
            </Label>
            <button
              id="loop-toggle"
              role="switch"
              aria-checked={loop}
              onClick={() => setLoop(!loop)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors ${loop ? "bg-primary" : "bg-input"}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${loop ? "translate-x-4" : "translate-x-0"}`} />
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">
              Save Changes
            </Button>
            {audioBlob && (
              <Button onClick={handleDelete} variant="destructive" size="sm">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
