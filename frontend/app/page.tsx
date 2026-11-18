"use client";

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from "react";
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
  warnings: string[];
  original_image_data_url: string;
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
      : result.original_image_data_url
    : previewUrl;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    const invalid =
      selectedFile &&
      (!["image/png", "image/jpeg", "image/webp"].includes(selectedFile.type) ||
        selectedFile.size > 10 * 1024 * 1024 ||
        !selectedFile.size);
    if (invalid) event.target.value = "";
    setFile(invalid ? null : selectedFile);
    setResult(null);
    setNotice(null);
    setError(
      invalid
        ? "Chọn ảnh PNG, JPG hoặc WebP có dung lượng tối đa 10 MB."
        : null,
    );
    setViewMode("annotated");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(
      selectedFile && !invalid ? URL.createObjectURL(selectedFile) : null,
    );
  }

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
    formData.append("user_goal", question.trim());

    try {
      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail ?? "Không phân tích được ảnh.");
      }

      const payload = (await response.json()) as AnalyzeResponse;
      setResult(payload);
      setViewMode("annotated");
      setNotice("Đã tạo hướng dẫn.");
      if (window.matchMedia("(max-width: 760px)").matches)
        preview.current?.scrollIntoView({ block: "start" });
    } catch (analyzeError) {
      setError(
        analyzeError instanceof Error
          ? analyzeError.message
          : "Không xử lý được yêu cầu.",
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
            <PanelTop size={15} /> Không gian làm việc
          </span>
        </div>
      </header>
      <main className="wrap">
        <div className="intro">
          <h1>
            Hướng dẫn từ <em>ảnh chụp.</em>
          </h1>
          <p>
            Tải ảnh giao diện và mô tả mục tiêu để xem từng bước thao tác ngay
            trên ảnh.
          </p>
        </div>
        <div className="workspace">
          <aside className="panel setup">
            <h2>
              <Layers /> Tạo hướng dẫn
            </h2>
            <form onSubmit={handleAnalyze}>
              <span className="field">Ảnh giao diện</span>
              <label className="drop">
                <input
                  disabled={isLoading}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
                <UploadCloud />
                <b>{file?.name || "Chọn ảnh để tải lên"}</b>
                <small>PNG, JPG, WebP · Tối đa 10 MB</small>
              </label>
              <label className="field" htmlFor="goal">
                Bạn muốn làm gì?
              </label>
              <textarea
                id="goal"
                disabled={isLoading}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ví dụ: Làm sao để chia sẻ tài liệu này?"
                rows={3}
              />
              <button className="submit" disabled={!canSubmit}>
                {isLoading ? "Đang phân tích…" : "Phân tích ảnh"}
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
                <Crosshair /> Khung xem trước
              </h2>
              {!file && <span className="tag">Ví dụ minh họa</span>}
            </div>
            <div className="canvas">
              {shownImage ? (
                <img
                  className="actual"
                  src={shownImage}
                  alt={
                    result && viewMode === "annotated"
                      ? "Ảnh với các bước thao tác được đánh dấu"
                      : "Ảnh giao diện đã chọn"
                  }
                />
              ) : (
                <div
                  className="sample"
                  aria-label="Ví dụ về vị trí nút chia sẻ trong một tài liệu"
                >
                  <div className="chrome">
                    <i />
                    <i />
                    <i />
                    <span>Tài liệu của tôi</span>
                  </div>
                  <div className="samplebar">
                    <span>
                      <Folder size={14} /> Dự án / Sổ tay
                    </span>
                    <b>
                      <sup>1</sup>
                      <Share2 size={12} /> Chia sẻ
                      <MousePointer2 className="pointer" />
                    </b>
                  </div>
                  <div className="poster">
                    <strong>
                      Miền
                      <br />
                      <em>sơn cước.</em>
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
                  Có hướng dẫn
                </button>
                <button
                  aria-pressed={viewMode === "original"}
                  onClick={() => setViewMode("original")}
                >
                  Ảnh gốc
                </button>
                <a
                  href={result.annotated_image_data_url}
                  download="guidelens.png"
                >
                  <Download size={15} /> Tải ảnh
                </a>
              </div>
            ) : (
              <div className="caption">
                {file ? <ImagePlus /> : <MousePointerClick />}
                {file
                  ? isLoading
                    ? "Đang xác định vị trí các thao tác…"
                    : "Ảnh đã sẵn sàng để phân tích."
                  : "Chọn “Chia sẻ” ở góc trên bên phải tài liệu."}
              </div>
            )}
          </section>
        </div>
        {result && (
          <section className="results">
            <h2>Các bước thao tác</h2>
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
            {result.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            <details>
              <summary>Thông tin phân tích</summary>
              <p>
                {result.model_used} · {result.image_width} ×{" "}
                {result.image_height} px
              </p>
              {result.steps.map((s) => (
                <p key={s.order}>
                  Bước {s.order} · {s.action} / {s.target_type} · ({s.x}, {s.y})
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
