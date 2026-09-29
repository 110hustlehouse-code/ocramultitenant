"use client";

import { FileAudio, Mic, Square, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { audioUploadedAction, requestUploadAction, transcriptAction } from "@/app/(app)/verbali/actions";

type Mode = "registra" | "carica" | "testo";

/** Tre modi per dare a OCRA la riunione: registrarla ora, caricare un audio, incollare il testo. */
export function MeetingInput({ meetingId, audioEnabled }: { meetingId: string; audioEnabled: boolean }) {
  const [mode, setMode] = useState<Mode>(audioEnabled ? "registra" : "testo");
  const tabs: Array<{ id: Mode; label: string; icon: typeof Mic; disabled?: boolean }> = [
    { id: "registra", label: "Registra ora", icon: Mic, disabled: !audioEnabled },
    { id: "carica", label: "Carica audio", icon: FileAudio, disabled: !audioEnabled },
    { id: "testo", label: "Incolla testo", icon: Type },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={mode === t.id}
            disabled={t.disabled}
            onClick={() => setMode(t.id)}
            className={cn(buttonClass.secondary, mode === t.id && "border-text", t.disabled && "cursor-not-allowed opacity-40")}
          >
            <t.icon className="size-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      {!audioEnabled && (
        <p className="text-sm text-muted">
          Registrazione e caricamento audio si attivano configurando archivio file e trascrizione. Intanto puoi incollare il
          testo (ad esempio la trascrizione di Meet o Zoom).
        </p>
      )}
      {mode === "registra" && <Recorder meetingId={meetingId} />}
      {mode === "carica" && <AudioUpload meetingId={meetingId} />}
      {mode === "testo" && <TranscriptForm meetingId={meetingId} />}
    </div>
  );
}

/**
 * Carica un Blob su R2 con URL firmato, mostrando l'avanzamento; poi avvia l'elaborazione.
 * Se qualcosa va storto il file resta in memoria e si può riprovare: una riunione registrata
 * non si deve perdere per un caricamento fallito.
 */
function useUploader(meetingId: string, recorded: boolean) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ blob: Blob; name: string } | null>(null);

  // Chiudere la pagina durante il caricamento perderebbe la registrazione.
  useEffect(() => {
    if (progress === null) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [progress]);

  async function upload(blob: Blob, name: string) {
    setError(null);
    setFailed(null);
    const fail = (message: string) => {
      setProgress(null);
      setFailed({ blob, name });
      setError(message);
    };
    const type = blob.type || "audio/webm";
    let res: Awaited<ReturnType<typeof requestUploadAction>>;
    try {
      res = await requestUploadAction(meetingId, { name, type, size: blob.size });
    } catch {
      return fail("Connessione assente. Riprova il caricamento.");
    }
    if (!res.url || !res.key) return fail(res.error ?? "Caricamento non disponibile.");
    setProgress(0);
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", res.url!);
      xhr.setRequestHeader("Content-Type", type);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(blob);
    });
    if (!ok) return fail("Caricamento non riuscito. Controlla la connessione e riprova.");
    let done: Awaited<ReturnType<typeof audioUploadedAction>>;
    try {
      done = await audioUploadedAction(meetingId, res.key, recorded);
    } catch {
      return fail("Connessione assente. Riprova il caricamento.");
    }
    if (done.error) return fail(done.error);
    router.refresh();
  }

  const retry = failed ? () => void upload(failed.blob, failed.name) : null;
  return { upload, retry, progress, error };
}

function UploadStatus({ progress, error, retry }: { progress: number | null; error: string | null; retry: (() => void) | null }) {
  return (
    <>
      {progress !== null && (
        <div className="space-y-1" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="num text-xs text-muted">Caricamento {progress}%</p>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {retry && (
        <button type="button" onClick={retry} className={buttonClass.secondary}>
          Riprova il caricamento
        </button>
      )}
    </>
  );
}

function Recorder({ meetingId }: { meetingId: string }) {
  const { upload, retry, progress, error } = useUploader(meetingId, true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const lock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", warn);
    };
  }, [recording]);

  async function start() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void lock.current?.release();
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        void upload(blob, rec.mimeType.includes("mp4") ? "registrazione.m4a" : "registrazione.webm");
      };
      // Microfono staccato o permesso revocato: si chiude e si carica quello che c'è.
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (rec.state === "recording") {
          rec.stop();
          setRecording(false);
        }
      });
      rec.start(10_000); // un pezzo ogni 10 s: se la pagina si chiude male, si perde poco
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
      // Sul telefono lo schermo non deve spegnersi durante la riunione.
      lock.current = await navigator.wakeLock?.request("screen").catch(() => null);
    } catch {
      setMicError("Microfono non disponibile: controlla i permessi del browser.");
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Metti il telefono o il portatile al centro del tavolo. <strong className="text-text">Avvisa i partecipanti</strong> che
        la riunione viene registrata. Tieni la pagina aperta fino alla fine.
      </p>
      <div className="flex items-center gap-4">
        {!recording ? (
          <button type="button" onClick={start} disabled={progress !== null || retry !== null} className={buttonClass.primary}>
            <Mic className="size-4" aria-hidden /> Inizia a registrare
          </button>
        ) : (
          <button type="button" onClick={stop} className={buttonClass.danger}>
            <Square className="size-4" aria-hidden /> Termina e crea il verbale
          </button>
        )}
        {recording && (
          <span className="flex items-center gap-2" role="timer" aria-live="off">
            <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
            <span className="num text-lg font-semibold">
              {mm}:{ss}
            </span>
          </span>
        )}
      </div>
      {micError && <p className="text-sm text-danger">{micError}</p>}
      <UploadStatus progress={progress} error={error} retry={retry} />
    </div>
  );
}

function AudioUpload({ meetingId }: { meetingId: string }) {
  const { upload, retry, progress, error } = useUploader(meetingId, false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Registrazione di Meet, Zoom, Teams o del telefono: mp3, m4a, wav, webm, mp4 (fino a 500 MB).</p>
      <input
        type="file"
        accept="audio/*,video/mp4,video/webm"
        aria-label="File audio"
        disabled={progress !== null}
        className={inputClass}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f, f.name);
        }}
      />
      <UploadStatus progress={progress} error={error} retry={retry} />
    </div>
  );
}

function TranscriptForm({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(transcriptAction, undefined);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state && !state.error) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={meetingId} />
      <textarea
        ref={area}
        name="transcript"
        rows={10}
        placeholder="Incolla qui la trascrizione della riunione…"
        aria-label="Trascrizione"
        className={inputClass}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Invio…" : "Crea il verbale"}
        </button>
        <label className="cursor-pointer text-sm text-muted underline">
          oppure carica un file .txt
          <input
            type="file"
            accept=".txt,.vtt,.srt,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f && area.current) area.current.value = await f.text();
            }}
          />
        </label>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
