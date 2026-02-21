"use client"

import type React from "react"

import { SoundPadButton } from "./sound-pad-button"
import { useAudio } from "./audio-provider"
import { Button } from "@/components/ui/button"
import { Edit3, Check } from "lucide-react"

export function SoundPadGrid() {
  const { buttonOrder, isEditMode, setIsEditMode, reorderButtons } = useAudio()

  const rowColors = ["slate", "rose", "blue", "green", "amber", "slate"]

  const getDefaultColor = (buttonId: string) => {
    const numId = Number.parseInt(buttonId)
    const row = Math.floor((numId - 1) / 6)
    return rowColors[row]
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isEditMode) return
    e.dataTransfer.setData("text/plain", index.toString())
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!isEditMode) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    if (!isEditMode) return
    e.preventDefault()
    const dragIndex = Number.parseInt(e.dataTransfer.getData("text/plain"))
    reorderButtons(dragIndex, dropIndex)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Button
          onClick={() => setIsEditMode(!isEditMode)}
          variant={isEditMode ? "default" : "outline"}
          size="sm"
          className="flex items-center gap-2"
        >
          {isEditMode ? (
            <>
              <Check className="w-4 h-4" />
              Done
            </>
          ) : (
            <>
              <Edit3 className="w-4 h-4" />
              Edit Layout
            </>
          )}
        </Button>
      </div>

      {/* Mobile: smaller grid with gaps */}
      <div className="grid grid-cols-6 gap-1 p-2 max-w-sm mx-auto md:hidden">
        {buttonOrder.map((buttonId, index) => (
          <div
            key={buttonId}
            draggable={isEditMode}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className={isEditMode ? "cursor-move" : ""}
          >
            <SoundPadButton
              id={buttonId}
              defaultColor={getDefaultColor(buttonId)}
              isEditMode={isEditMode}
              index={index}
              isMobile={true}
            />
          </div>
        ))}
      </div>

      {/* Desktop: 6x6 grid */}
      <div className="hidden md:grid md:grid-cols-6 md:gap-2 max-w-4xl mx-auto">
        {buttonOrder.map((buttonId, index) => (
          <div
            key={buttonId}
            draggable={isEditMode}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            className={isEditMode ? "cursor-move" : ""}
          >
            <SoundPadButton
              id={buttonId}
              defaultColor={getDefaultColor(buttonId)}
              isEditMode={isEditMode}
              index={index}
              isMobile={false}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
