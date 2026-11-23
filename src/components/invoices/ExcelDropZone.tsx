"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud } from "lucide-react";
import { BusyRing } from "@/components/ui/Loading";

interface Props {
  /** Ties the label to the hidden input; unique on the page. */
  id: string;
  /** The file being read, or the one just read. */
  fileName: string;
  reading: boolean;
  onFile: (file: File) => void;
}

/**
 * Where the monthly Excel file goes in: drop it on the box, or click it (or press Enter on it)
 * to choose. One file - if several are dropped, the first is taken. What is not an Excel file is
 * left to the reader to refuse, with its own words.
 */
export function ExcelDropZone({ id, fileName, reading, onFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  // dragenter/dragleave also fire for every child element, so a counter, not a flag.
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  function pick(file: File | undefined) {
    if (file) onFile(file);
    // Choosing the same file again must still fire a change.
    if (input.current) input.current.value = "";
  }

  return (
    <label
      htmlFor={id}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 md:py-8 text-center cursor-pointer transition-all duration-300 ease-in-out focus-within:ring-2 focus-within:ring-[#0057BC]/40 ${
        dragging
          ? "border-[#0057BC] bg-[#0057BC]/10 dark:border-[#00A3DE] dark:bg-[#00A3DE]/15 scale-[1.01]"
          : "border-[#B0B5B5] hover:border-[#0057BC] hover:bg-[#0057BC]/5 dark:hover:border-[#00A3DE] dark:hover:bg-[#00A3DE]/10"
      }`}
    >
      <input
        ref={input}
        id={id}
        type="file"
        accept=".xlsx,.xlsm"
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {reading ? (
        <BusyRing size={44} />
      ) : (
        <UploadCloud className={`w-8 h-8 transition-transform duration-300 ease-in-out ${dragging ? "-translate-y-1" : ""} text-[#0057BC] dark:text-[#00A3DE]`} />
      )}
      <span className="text-sm md:text-base font-medium text-[#2D2A28] dark:text-white">
        {reading ? "Reading..." : dragging ? "Drop the file to read it" : "Drag & drop the Excel file here"}
      </span>
      {!reading && !dragging && (
        <span className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
          or <span className="text-[#0057BC] dark:text-[#00A3DE] underline">choose a file</span> (.xlsx / .xlsm)
        </span>
      )}
      {fileName && (
        <span className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <FileSpreadsheet className="w-4 h-4 shrink-0" />
          <span className="break-all">{fileName}</span>
        </span>
      )}
    </label>
  );
}
