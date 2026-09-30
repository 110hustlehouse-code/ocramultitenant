"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { confirmUploadAction, requestUploadAction } from "@/app/(app)/documenti/actions";

/** Carica un file direttamente su R2 con URL firmato (stesso pattern degli audio dei Verbali). */
export function DocumentUpload({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const meta = { name: file.name, type: file.type || "application/octet-stream", size: file.size };
    const res = await requestUploadAction(projectId, meta);
    if (!res.url || !res.key) {
      setError(res.error ?? "Caricamento non disponibile.");
      return;
    }
    setProgress(0);
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", res.url!);
      xhr.setRequestHeader("Content-Type", meta.type);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok) {
      setProgress(null);
      setError("Caricamento non riuscito. Controlla la connessione e riprova.");
      return;
    }
    const done = await confirmUploadAction(projectId, res.key, meta);
    setProgress(null);
    if (done?.error) {
      setError(done.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <label className={cn(buttonClass.primary, "cursor-pointer", progress !== null && "pointer-events-none opacity-50")}>
        <Upload className="size-4" aria-hidden />
        {progress !== null ? `Caricamento ${progress}%` : "Carica file"}
        <input
          type="file"
          className="sr-only"
          disabled={progress !== null}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
