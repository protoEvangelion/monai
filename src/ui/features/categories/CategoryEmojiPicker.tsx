import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import { PencilIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CategoryEmojiPicker({
  icon,
  isGroup,
  onIconChange,
}: {
  icon: string;
  isGroup: boolean;
  onIconChange: (icon: string) => void;
}) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [openPickerAbove, setOpenPickerAbove] = useState(false);
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        iconBtnRef.current &&
        !iconBtnRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, [showEmojiPicker]);

  const toggleEmojiPicker = () => {
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      return;
    }
    const rect = iconBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const pickerHeight = 360;
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      setOpenPickerAbove(spaceBelow < pickerHeight && spaceAbove > spaceBelow);
    }
    setShowEmojiPicker(true);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="sr-only">Icon</label>
      <div className="relative">
        <button
          ref={iconBtnRef}
          type="button"
          onClick={toggleEmojiPicker}
          className="group w-14 h-10 relative flex items-center justify-center rounded-xl border border-default-200 bg-default-100 hover:bg-default-200 text-2xl transition-colors cursor-pointer"
          aria-label="Choose emoji"
        >
          <span>{icon || (isGroup ? "📁" : "📌")}</span>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <PencilIcon size={14} className="text-white" />
          </span>
        </button>
        {showEmojiPicker ? (
          <div
            ref={pickerRef}
            className={`absolute left-0 z-50 ${openPickerAbove ? "bottom-full mb-2" : "top-full mt-2"}`}
          >
            <EmojiPicker
              theme={Theme.AUTO}
              width={320}
              height={340}
              onEmojiClick={(event: EmojiClickData) => {
                onIconChange(event.emoji);
                setShowEmojiPicker(false);
              }}
              lazyLoadEmojis
              searchPlaceholder="Search emoji…"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
