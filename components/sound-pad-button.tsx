"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Edit3, Play, Square, Repeat } from "lucide-react"
import { useAudio } from "./audio-provider"
import { AudioEditModal } from "./audio-edit-modal"
import { cn } from "@/lib/utils"

interface SoundPadButtonProps {
  id: string
  defaultColor?: string
  isEditMode?: boolean
  index?: number
  isMobile?: boolean
}

export function SoundPadButton({ id, defaultColor, isEditMode, index, isMobile = false }: SoundPadButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { audioData, playAudio, isPlaying } = useAudio()

  const data = audioData[id]
  const hasAudio = !!data?.audioBlob
  const playing = isPlaying[id]
  const buttonColor = data?.color || defaultColor || "slate"

  const handleClick = () => {
    if (hasAudio && !isEditMode) {
      playAudio(id)
    }
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsModalOpen(true)
  }

  const getColorClasses = (color: string, isActive: boolean, isPlaying: boolean) => {
    const colorMap = {
      slate: {
        base: "bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300",
        active: "bg-slate-400 hover:bg-slate-500 text-slate-900 border-slate-500",
        playing: "bg-slate-500 hover:bg-slate-600 text-white border-slate-600 shadow-lg scale-105",
      },
      rose: {
        base: "bg-rose-200 hover:bg-rose-300 text-rose-800 border-rose-300",
        active: "bg-rose-400 hover:bg-rose-500 text-rose-900 border-rose-500",
        playing: "bg-rose-500 hover:bg-rose-600 text-white border-rose-600 shadow-lg scale-105",
      },
      blue: {
        base: "bg-blue-200 hover:bg-blue-300 text-blue-800 border-blue-300",
        active: "bg-blue-400 hover:bg-blue-500 text-blue-900 border-blue-500",
        playing: "bg-blue-500 hover:bg-blue-600 text-white border-blue-600 shadow-lg scale-105",
      },
      green: {
        base: "bg-green-200 hover:bg-green-300 text-green-800 border-green-300",
        active: "bg-green-400 hover:bg-green-500 text-green-900 border-green-500",
        playing: "bg-green-500 hover:bg-green-600 text-white border-green-600 shadow-lg scale-105",
      },
      amber: {
        base: "bg-amber-200 hover:bg-amber-300 text-amber-800 border-amber-300",
        active: "bg-amber-400 hover:bg-amber-500 text-amber-900 border-amber-500",
        playing: "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-lg scale-105",
      },
    }

    const colors = colorMap[color as keyof typeof colorMap] || colorMap.slate

    if (isPlaying) return colors.playing
    if (isActive) return colors.active
    return colors.base
  }

  return (
    <>
      <div className={cn("relative", isMobile ? "w-16 h-16" : "w-28 h-28")}>
        <Button
          onClick={handleClick}
          className={cn(
            "w-full h-full p-2 transition-all duration-200 group",
            hasAudio
              ? getColorClasses(buttonColor, hasAudio, playing)
              : "bg-muted hover:bg-muted/80 text-muted-foreground border-2 border-border",
            !hasAudio && "border-2 border-border",
            isEditMode && "wiggle cursor-move",
          )}
          disabled={!hasAudio && !isEditMode}
        >
          <div className="flex flex-col items-center justify-center gap-1">
            {playing ? (
              <Square className={cn(isMobile ? "w-4 h-4" : "w-6 h-6")} />
            ) : hasAudio ? (
              <Play className={cn(isMobile ? "w-4 h-4" : "w-6 h-6")} />
            ) : (
              <div className={cn(isMobile ? "w-4 h-4" : "w-6 h-6")} />
            )}
            <span className={cn("font-medium truncate max-w-full", isMobile ? "text-xs" : "text-xs")}>
              {data?.name || id}
            </span>
          </div>
        </Button>

        <button
          onClick={handleEdit}
          className={cn(
            "absolute top-1 right-1 rounded-full z-10",
            "bg-background/90 border border-border/50 shadow-sm",
            "opacity-60 hover:opacity-100 transition-opacity duration-200",
            "hover:bg-accent hover:text-accent-foreground",
            "flex items-center justify-center cursor-pointer",
            "pointer-events-auto",
            isEditMode && "opacity-30",
            isMobile ? "w-4 h-4" : "w-5 h-5",
          )}
        >
          <Edit3 className={cn(isMobile ? "w-2 h-2" : "w-2.5 h-2.5")} />
        </button>

        {data?.loop && (
          <div className={cn(
            "absolute bottom-1 left-1 rounded-full z-10 pointer-events-none",
            "flex items-center justify-center",
            isMobile ? "w-3 h-3" : "w-4 h-4",
          )}>
            <Repeat className={cn("text-current opacity-60", isMobile ? "w-2 h-2" : "w-2.5 h-2.5")} />
          </div>
        )}
      </div>

      <AudioEditModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} padId={id} currentData={data} />
    </>
  )
}
