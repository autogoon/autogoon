"use client";

// The play screen's hamburger menu: jump between the panel's tabs, toggle the
// program preview, open the LLM request viewer. Rendered inside a `relative`
// wrapper in the slim top bar; the full-screen transparent backdrop closes it,
// as does picking any item. Buttons only — Companions registers no vosk words.

import { Check } from "lucide-react";

export type PlayTab = "session" | "controls" | "debug";

const TABS: { id: PlayTab; label: string }[] = [
  { id: "session", label: "Session" },
  { id: "controls", label: "Controls" },
  { id: "debug", label: "Debug" },
];

const ITEM =
  "hover:bg-foreground/10 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm";

export function PlayMenu({
  tab,
  onSelectTab,
  previewOpen,
  onTogglePreview,
  onShowLlmRequest,
  onClose,
}: {
  tab: PlayTab;
  onSelectTab: (tab: PlayTab) => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onShowLlmRequest: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="bg-background absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border p-1 shadow-lg">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={ITEM}
            onClick={() => {
              onSelectTab(t.id);
              onClose();
            }}
          >
            <Check className={`size-4 ${tab === t.id ? "" : "invisible"}`} />
            {t.label}
          </button>
        ))}
        <div className="my-1 border-t" />
        <button
          type="button"
          className={ITEM}
          onClick={() => {
            onTogglePreview();
            onClose();
          }}
        >
          <Check className={`size-4 ${previewOpen ? "" : "invisible"}`} />
          Program preview
        </button>
        <button
          type="button"
          className={ITEM}
          onClick={() => {
            onShowLlmRequest();
            onClose();
          }}
        >
          <span className="size-4" />
          LLM request
        </button>
      </div>
    </>
  );
}
