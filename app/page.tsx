"use client"
import { SoundPadGrid } from "@/components/sound-pad-grid"
import type React from "react"

import { AudioProvider, useAudio } from "@/components/audio-provider"
import { Button } from "@/components/ui/button"
import { Download, Upload, MonitorSpeaker } from "lucide-react"
import { useState, useRef } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

function OutputDeviceSelector() {
  const { availableOutputDevices, outputDeviceId, setOutputDeviceId } = useAudio()

  if (availableOutputDevices.length <= 1) return null

  return (
    <div className="flex items-center gap-1.5">
      <MonitorSpeaker className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <select
        value={outputDeviceId}
        onChange={e => setOutputDeviceId(e.target.value)}
        className="text-xs bg-transparent border border-border rounded px-1.5 py-1 text-foreground max-w-[140px] truncate cursor-pointer"
      >
        <option value="">Default</option>
        {availableOutputDevices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Output ${d.deviceId.slice(0, 6)}`}
          </option>
        ))}
      </select>
    </div>
  )
}

function ExportImportButtons() {
  const { exportData, importData } = useAudio()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      await exportData()
      setTimeout(() => setIsExporting(false), 1000)
    } catch (error) {
      console.error("Export failed:", error)
      setIsExporting(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      await importData(file)
      setTimeout(() => setIsImporting(false), 1000)
    } catch (error) {
      console.error("Import failed:", error)
      toast.error("Import failed — please select a valid sound pad export file.")
      setIsImporting(false)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex gap-2">
      <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileChange} className="hidden" />
      <Button
        onClick={handleImportClick}
        variant="outline"
        size="sm"
        className={cn(
          "flex items-center gap-2 transition-colors duration-300",
          isImporting ? "bg-green-100 border-green-300 text-green-700" : "bg-transparent",
        )}
        disabled={isImporting}
      >
        <Upload className="w-4 h-4" />
        {isImporting ? "Imported!" : "Import"}
      </Button>
      <Button
        onClick={handleExport}
        variant="outline"
        size="sm"
        className={cn(
          "flex items-center gap-2 transition-colors duration-300",
          isExporting ? "bg-green-100 border-green-300 text-green-700" : "bg-transparent",
        )}
        disabled={isExporting}
      >
        <Download className="w-4 h-4" />
        {isExporting ? "Exported!" : "Export"}
      </Button>
    </div>
  )
}

export default function Home() {
  return (
    <AudioProvider>
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1 flex items-start pt-1">
                <OutputDeviceSelector />
              </div>
              <div className="flex-1 text-center">
                <h1 className="text-3xl font-bold text-foreground mb-2">Sound Pad Mixer</h1>
                <p className="text-muted-foreground">Professional audio mixing interface</p>
              </div>
              <div className="flex-1 flex justify-end">
                <ExportImportButtons />
              </div>
            </div>
          </header>
          <SoundPadGrid />
        </div>
      </div>
    </AudioProvider>
  )
}
