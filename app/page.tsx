"use client";

import { FormEvent, useState } from "react";
import { ImageIcon, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ImagineResponse = {
  text: string;
  imageUrl: string;
  imagePrompt: string;
  mode: "existing-image";
  textMode: "gemini" | "local" | "local-fallback";
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8010";

export default function Home() {
  const [teacherInput, setTeacherInput] = useState("");
  const [result, setResult] = useState<ImagineResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Current demo sends typed teacher speech. The same API boundary can
      // later receive live transcript chunks from speech-to-text.
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherSpeech: teacherInput })
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          problem?.detail ?? "The AI backend could not process the input."
        );
      }

      const data = (await response.json()) as ImagineResponse;
      setResult(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unexpected request failure."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <section className="mx-auto max-w-5xl rounded border border-border bg-white p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">IMAGINEv1</h1>
            <p className="text-sm text-muted-foreground">
              Real-time classroom speech to a visual note.
            </p>
          </div>
          <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {result ? `existing image + ${result.textMode} note` : "waiting"}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label
              htmlFor="teacher-speech"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Teacher speech input
            </label>
            <Textarea
              id="teacher-speech"
              value={teacherInput}
              onChange={(event) => setTeacherInput(event.target.value)}
              placeholder="Type a short lesson explanation..."
              required
              rows={4}
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || teacherInput.trim().length === 0}
            className="self-end md:w-44"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Generate
          </Button>
        </form>

        {error ? (
          <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="overflow-hidden rounded border border-border bg-muted">
          {result ? (
            <div>
              <div className="aspect-video bg-background">
                {/* Backend selects an existing hosted image and returns its URL. */}
                <img
                  src={result.imageUrl}
                  alt={result.imagePrompt}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="bg-white p-4">
                <h2 className="mb-2 text-lg font-semibold">Live note</h2>
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {result.text}
                </p>
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  {result.imagePrompt} | Text: {result.textMode}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8" aria-hidden="true" />
              Submit teacher speech to show one combined visual note.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
