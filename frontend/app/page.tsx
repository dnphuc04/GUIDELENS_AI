"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Download,
  ImagePlus,
  Loader2,
  MousePointerClick,
  ArrowUpRight,
  ScanLine,
  Layers,
  PanelTop,
  Folder,
  Share2,
  MousePointer2,
  UploadCloud,
} from "lucide-react";

type Step = {
  order: number;
  action: string;
  target_type: string;
  label: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type AnalyzeResponse = {
  source_filename: string | null;
  image_width: number;
  image_height: number;
  image_mime_type: string;
  model_used: string;
  summary: string;
  steps: Step[];
  suggested_next_steps?: string[];
  warnings: string[];
  annotated_image_data_url: string;
};

type ViewMode = "annotated" | "original";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function HomePage() {
  const preview = useRef<HTMLElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("annotated");
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(file && question.trim()) && !isLoading,
    [file, question, isLoading],
  );
  const shownImage = result
    ? viewMode === "annotated"
      ? result.annotated_image_data_url
      : previewUrl
    : previewUrl;

  function selectScreenshot(image: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(image.type) ||
        image.size === 0 || image.size > 10 * 1024 * 1024) {
      setError("Choose a PNG, JPG, or WebP image up to 10 MB.");
      return;
    }

    // Start a sleeping backend while the user writes the goal.
    void fetch(`${apiBaseUrl}/health`, { cache: "no-store" }).catch(() => {});
    setFile(image);
    setPreviewUrl(URL.createObjectURL(image));
    setResult(null);
    setNotice(null);
    setError(null);
    setViewMode("annotated");
  }

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (isLoading || !event.clipboardData) return;
      const item = Array.from(event.clipboardData.items).find(
        item => item.kind === "file" && item.type.startsWith("image/"),
      );
      const image = item?.getAsFile();
      if (!image) return;
      event.preventDefault();
      selectScreenshot(image);
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isLoading]);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !question.trim()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("include_original", "false");
    formData.append("user_goal", question.trim());

    try {
      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "We couldn't analyze this image.");
      }

      const payload = (await response.json()) as AnalyzeResponse;
      setResult(payload);
      setViewMode("annotated");
      setNotice("Your guide is ready.");
      if (window.matchMedia("(max-width: 760px)").matches)
        preview.current?.scrollIntoView({ block: "start" });
    } catch (analyzeError) {
      setError(
        analyzeError instanceof TypeError
          ? "Couldn't reach the analysis service. Your screenshot is still here. Try again in a moment."
          : analyzeError instanceof Error
          ? analyzeError.message
          : "We couldn't process your request.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <header className="mast">
        <div className="wrap bar">
          <a className="wordmark" href="./">
            <ScanLine />
            GuideLens
          </a>
          <span className="navlabel">
            <PanelTop size={15} /> Workspace
          </span>
        </div>
      </header>
      <main className="wrap">
        <div className="intro">
          <h1>
            A guide from your <em>screenshot.</em>
          </h1>
          <p>
            Upload a screenshot and tell us what you want to do. We’ll mark each step on the image.
          </p>
        </div>
        <div className="workspace">
          <aside className="panel setup">
            <h2>
              <Layers /> Create a guide
            </h2>
            <form onSubmit={handleAnalyze}>
              <span className="field">Screenshot</span>
              <label className="drop">
                <input
                  disabled={isLoading}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={event => {
                    const image = event.target.files?.[0];
                    if (image) selectScreenshot(image);
                    event.target.value = "";
                  }}
                  className="sr-only"
                />
                <UploadCloud />
                <b>{file?.name || "Choose a screenshot"}</b>
                <small>Or paste anywhere with ⌘V or Ctrl+V</small>
                <small>PNG, JPG, WebP · Up to 10 MB</small>
              </label>
              <label className="field" htmlFor="goal">
                What would you like to do?
              </label>
              <textarea
                id="goal"
                disabled={isLoading}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="For example, how do I share this document?"
                rows={3}
              />
              <button className="submit" disabled={!canSubmit}>
                {isLoading ? "Analyzing…" : "Analyze screenshot"}
                {isLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ArrowUpRight />
                )}
              </button>
              {notice && <p role="status">{notice}</p>}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </aside>
          <section className="panel preview" ref={preview}>
            <div className="panelhead">
              <h2>
                <Crosshair /> Screenshot preview
              </h2>
              {!file && <span className="tag">Example</span>}
            </div>
            <div className="canvas">
              {shownImage ? (
                <img
                  className="actual"
                  src={shownImage}
                  alt={
                    result && viewMode === "annotated"
                      ? "Screenshot with numbered steps"
                      : "Selected screenshot"
                  }
                />
              ) : (
                <div
                  className="sample"
                  aria-label="Example document with the Share button highlighted"
                >
                  <div className="chrome">
                    <i />
                    <i />
                    <i />
                    <span>My documents</span>
                  </div>
                  <div className="samplebar">
                    <span>
                      <Folder size={14} /> Projects / Field notes
                    </span>
                    <b>
                      <sup>1</sup>
                      <Share2 size={12} /> Share
                      <MousePointer2 className="pointer" />
                    </b>
                  </div>
                  <div className="poster">
                    <strong>
                      Mountain
                      <br />
                      <em>journal.</em>
                    </strong>
                    <div className="sun" />
                    <div className="ridge far" />
                    <div className="ridge near" />
                  </div>
                </div>
              )}
            </div>
            {result ? (
              <div className="tools">
                <button
                  aria-pressed={viewMode === "annotated"}
                  onClick={() => setViewMode("annotated")}
                >
                  Annotated
                </button>
                <button
                  aria-pressed={viewMode === "original"}
                  onClick={() => setViewMode("original")}
                >
                  Original
                </button>
                <a
                  href={result.annotated_image_data_url}
                  download="guidelens.png"
                >
                  <Download size={15} /> Download
                </a>
              </div>
            ) : (
              <div className="caption">
                {file ? <ImagePlus /> : <MousePointerClick />}
                {file
                  ? isLoading
                    ? "Finding the steps in your screenshot…"
                    : "Your screenshot is ready to analyze."
                  : "Select “Share” in the upper-right corner of the document."}
              </div>
            )}
          </section>
        </div>
        {result && (
          <section className="results">
            <h2>Step-by-step guide</h2>
            <p>{result.summary}</p>
            <ol>
              {result.steps.map((step) => (
                <li key={step.order}>
                  <b>{step.order}</b>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            {!!result.suggested_next_steps?.length && (
              <section>
                <h3>Likely next steps</h3>
                {result.suggested_next_steps.map((step, index) => <p key={index}>{step}</p>)}
              </section>
            )}
            {result.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            <details>
              <summary>Analysis details</summary>
              <p>
                {result.model_used} · {result.image_width} ×{" "}
                {result.image_height} px
              </p>
              {result.steps.map((s) => (
                <p key={s.order}>
                  Step {s.order} · {s.action} / {s.target_type} · ({s.x}, {s.y})
                  · {s.width} × {s.height} · {Math.round(s.confidence * 100)}%
                </p>
              ))}
            </details>
          </section>
        )}
      </main>
    </>
  );
}
