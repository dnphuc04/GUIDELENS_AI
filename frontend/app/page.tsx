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
  ZoomIn,
  ZoomOut,
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
  annotated_image_data_url?: string;
};

type ViewMode = "annotated" | "original";

function StepDetail({ step, result, source, scale }: {
  step: Step; result: AnalyzeResponse; source: string; scale: number;
}) {
  const width = Math.min(result.image_width, Math.max(step.width * 2, step.height * 3, 160) / scale);
  const height = Math.min(result.image_height, Math.max(step.height * 2, width * 0.55, 88 / scale));
  const cx = step.x + step.width / 2;
  const cy = step.y + step.height / 2;
  const left = Math.max(0, Math.min(cx - width / 2, result.image_width - width));
  const top = Math.max(0, Math.min(cy - height / 2, result.image_height - height));
  const pointerSize = Math.min(width, height) * 0.14;
  const camera = useRef<SVGSVGElement>(null);
  const firstMove = useRef(true);
  useEffect(() => {
    const node = camera.current;
    if (!node) return;
    const box = node.viewBox.baseVal;
    const from = [box.x, box.y, box.width, box.height];
    const target = [left, top, width, height];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.setAttribute("viewBox", target.join(" "));
      return;
    }
    const start = performance.now() + (firstMove.current ? 220 : 0);
    const duration = firstMove.current ? 950 : 480;
    firstMove.current = false;
    let frame = 0;
    function draw(now: number) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const t = progress * progress * (3 - 2 * progress);
      node?.setAttribute("viewBox", target.map((end, i) => from[i] + (end - from[i]) * t).join(" "));
      if (progress < 1) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [left, top, width, height, result.image_width, result.image_height]);

  return (
    <svg ref={camera} className="step-detail" viewBox={`0 0 ${result.image_width} ${result.image_height}`} role="img"
      aria-label={`Step ${step.order}: ${step.label}, enlarged`}>
      <g key={step.order}>
        <image href={source} width={result.image_width} height={result.image_height} />
        <rect x={step.x} y={step.y} width={step.width} height={step.height} fill="none"
          stroke="#ba471d" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {step.action === "click" && <>
          <circle className="click-ripple" cx={cx} cy={cy} r={pointerSize * 0.45} stroke="#ba471d" strokeWidth={pointerSize/10} fill="none" />
          <g className="moving-pointer"><MousePointer2 x={cx - pointerSize / 8} y={cy - pointerSize / 8}
          width={pointerSize} height={pointerSize} color="white" fill="#242820" /></g></>}
      </g>
    </svg>
  );
}

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function HomePage() {
  const preview = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reopen = useRef<HTMLButtonElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (guideOpen && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [guideOpen]);
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("annotated");
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [section, setSection] = useState<"Guide" | "Steps" | "Image">("Guide");
  const [replay, setReplay] = useState(0);
  const [scale, setScale] = useState(1);
  const activeStep = stepIndex === null ? undefined : result?.steps[stepIndex];
  function showStep(index: number) {
    setSection("Guide");
    setStepIndex(index);
    setScale(1);
  }
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(file && question.trim()) && !isLoading,
    [file, question, isLoading],
  );
  const shownImage = result
    ? viewMode === "annotated"
      ? result.annotated_image_data_url || previewUrl
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
    setGuideOpen(false);
    setStepIndex(null);
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
    formData.append("stream_guide", "true");
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

      function displayGuide(guide: AnalyzeResponse) {
        setResult(guide);
        setSection(guide.steps.length ? "Guide" : "Steps");
        setGuideOpen(true);
        setStepIndex(guide.steps.length ? 0 : null);
        setReplay(value => value + 1);
        setScale(1);
        setViewMode("annotated");
        setNotice("Your guide is ready.");

      }

      if (response.headers.get("content-type")?.includes("application/x-ndjson") && response.body) {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let pending = "";
        let receivedGuide = false;
        let receivedOverlay = false;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const lines = (pending + value).split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) {
              const event = JSON.parse(line);
              if (event.guide) {
                displayGuide(event.guide);
                receivedGuide = true;
              } else if (event.overlay) {
                setResult(previous => previous && ({ ...previous, annotated_image_data_url: event.overlay }));
                receivedOverlay = true;
              }
            }
          }
          if (!receivedGuide || !receivedOverlay) throw new Error("Incomplete response.");
        } catch (error) {
          if (!receivedGuide) throw error;
          setError("The guide is ready, but the annotated download could not be loaded.");
        } finally {
          reader.releaseLock();
        }
      } else {
        displayGuide(await response.json());
      }
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

  const previewPanel = (
          <section className="panel preview" ref={preview} tabIndex={-1} aria-label="Screenshot preview">
            <div className="panelhead">
              <h2>
                <Crosshair /> {result ? "Your guide" : "Screenshot preview"}
              </h2>
              {result && <button className="edit-guide" onClick={() => dialog.current?.close()}>Close</button>}
              {!file && <span className="tag">Example</span>}
            </div>
            {result && error && <p className="error" role="alert">{error}</p>}
            {result && <nav className="guide-sections" aria-label="Guide views">
              {(["Guide", "Steps", "Image"] as const).map(item => <button key={item}
                aria-pressed={section === item} onClick={() => setSection(item)}>{item}</button>)}
            </nav>}
        {result && section === "Steps" && (
          <section className="results">
            <h2>Step-by-step guide</h2>
            <p dir="auto">{result.summary}</p>
            {!!result?.suggested_next_steps?.length && (
              <section className="upcoming">
                <h3>Likely next steps</h3>
                <ol>
                  {result.suggested_next_steps.map((step, index) => <li key={index} dir="auto">{step}</li>)}
                </ol>
              </section>
            )}
            <ol>
              {result.steps.map((step, index) => (
                <li key={step.order}>
                  <b>{step.order}</b>
                  <div>
                    <button className="focus-step" onClick={() => {
                      showStep(index);
                      preview.current?.focus({ preventScroll: true });

                    }}>{step.label} <ZoomIn size={16}/></button>
                    <p dir="auto">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
            {result.warnings.map((w, i) => (
              <p key={i} dir="auto">{w}</p>
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
                {section === "Image" && activeStep && result && previewUrl && <figure className="target-map">
                  <figcaption>Target in the original screenshot</figcaption>
                  <svg role="img" aria-label={`Location of ${activeStep.label} in the full screenshot`}
                    viewBox={`0 0 ${result.image_width} ${result.image_height}`}>
                    <image href={previewUrl} width={result.image_width} height={result.image_height}/>
                    <rect x={activeStep.x} y={activeStep.y} width={activeStep.width} height={activeStep.height}
                      stroke="#ba471d" strokeWidth="3" vectorEffect="non-scaling-stroke" fill="rgba(255,172,76,.2)"/>
                  </svg>
                </figure>}
            <div className="canvas" style={result && section !== "Guide" && !(section === "Image" && !activeStep) ? {display:"none"} : undefined}>
              {activeStep && result && previewUrl ? (
                <StepDetail key={replay} step={activeStep} result={result} source={previewUrl} scale={scale} />
              ) : shownImage ? (
                <img
                  key={viewMode}
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
            {section === "Guide" && activeStep && result && stepIndex !== null && (
              <div className="detail-bar">
                <p key={activeStep.order} aria-live="polite" dir="auto"><strong>Step {activeStep.order} · {activeStep.label}</strong><br/><span dir="auto">{activeStep.description}</span></p>
                <div className="detail-controls">
                  <button onClick={() => setReplay(value => value + 1)}>Replay</button>
                  {stepIndex > 0 && <button onClick={() => showStep(stepIndex - 1)}>Previous</button>}
                  {stepIndex < result.steps.length - 1 && <button onClick={() => showStep(stepIndex + 1)}>Next</button>}
                  <button aria-label="Zoom out" disabled={scale <= 0.5} onClick={() => setScale(scale / 2)}><ZoomOut size={18}/></button>
                  <button aria-label="Zoom in" disabled={scale >= 2} onClick={() => setScale(scale * 2)}><ZoomIn size={18}/></button>
                </div>

              </div>
            )}
            {result ? (
              <div className="tools" hidden={section !== "Image"}>
                {!activeStep && result.steps.length > 0 && <button onClick={() => showStep(0)}>Explore steps</button>}
                <button
                  disabled={!result.annotated_image_data_url}
                  aria-pressed={!activeStep && viewMode === "annotated"}
                  onClick={() => { setStepIndex(null); setViewMode("annotated"); }}
                >
                  Overview
                </button>
                <button
                  aria-pressed={!activeStep && viewMode === "original"}
                  onClick={() => { setStepIndex(null); setViewMode("original"); }}
                >
                  Original
                </button>
                {result.annotated_image_data_url && <a
                  href={result.annotated_image_data_url}
                  download="guidelens.png"
                >
                  <Download size={15} /> Download
                </a>}
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
  );

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
          {result ? (
            <>
              <section className="panel preview">
                <div className="panelhead">
                  <h2><Crosshair /> Screenshot preview</h2>
                  <button ref={reopen} className="open-guide" onClick={() => { setReplay(value => value + 1); setGuideOpen(true); }}>View guide</button>
                </div>
                <div className="canvas">{previewUrl && <img className="actual" src={previewUrl} alt="Selected screenshot" />}</div>
              </section>
              <dialog className="guide-dialog guide-open" ref={dialog} aria-label="Your guide"
                onClose={() => { setGuideOpen(false); reopen.current?.focus({ preventScroll: true }); }}>
                {previewPanel}
              </dialog>
            </>
          ) : previewPanel}
        </div>
      </main>
    </>
  );
}
