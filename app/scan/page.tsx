"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.min.css";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/files-client";
import { getUploadUrlAction } from "@/app/dashboard/classes/[id]/content-actions";

interface Page { id: string; dataUrl: string; }
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function optimizeImage(img: HTMLImageElement): string {
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.naturalWidth * scale);
  cv.height = Math.round(img.naturalHeight * scale);
  cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.82);
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="loading">Loading scanner…</div>}>
      <ScanInner />
    </Suspense>
  );
}

function ScanInner() {
  const router = useRouter();
  const params = useSearchParams();
  const classId = params.get("class") ?? "";
  const assignmentId = params.get("assignment") ?? "";
  const [pages, setPages] = useState<Page[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState(0);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [cropId, setCropId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  function addFile(file: File) {
    if (!file.type.startsWith("image/")) { setMsg("Only images can be scanned."); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setPages((p) => [...p, { id: uid(), dataUrl: optimizeImage(img) }]);
      URL.revokeObjectURL(url);
      setPdfUrl(null);
    };
    img.onerror = () => setMsg("Could not read that image.");
    img.src = url;
  }

  async function startLive() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
    } catch {
      setMsg("Camera not available. Use Take photo instead.");
    }
  }
  function stopLive() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }
  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setMsg("Camera not ready."); return; }
    const cv = document.createElement("canvas");
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext("2d")!.drawImage(v, 0, 0);
    const img = new Image();
    img.onload = () => {
      setPages((p) => [...p, { id: uid(), dataUrl: optimizeImage(img) }]);
      setPdfUrl(null);
    };
    img.src = cv.toDataURL("image/jpeg", 0.9);
  }

  function move(id: string, dir: number) {
    setPages((p) => {
      const i = p.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setPdfUrl(null);
  }

  function openCrop(id: string) {
    setCropId(id);
    setTimeout(() => {
      const img = cropImgRef.current;
      const target = pages.find((p) => p.id === id);
      if (!img || !target) return;
      cropperRef.current?.destroy();
      img.src = target.dataUrl;
      img.onload = () => { cropperRef.current = new Cropper(img, { viewMode: 1, autoCropArea: 1 }); };
    }, 0);
  }
  function applyCrop() {
    const c = cropperRef.current;
    const target = pages.find((p) => p.id === cropId);
    if (!c || !target) return;
    const url = c.getCroppedCanvas({ maxWidth: 1600 }).toDataURL("image/jpeg", 0.85);
    setPages((p) => p.map((x) => (x.id === cropId ? { ...x, dataUrl: url } : x)));
    c.destroy();
    cropperRef.current = null;
    setCropId(null);
    setPdfUrl(null);
  }

  async function generate() {
    try {
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const W = 595.28, H = 841.89;
      for (let i = 0; i < pages.length; i++) {
        const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
          const im = new Image();
          im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = rej;
          im.src = pages[i].dataUrl;
        });
        if (i > 0) pdf.addPage();
        const s = Math.min(W / dims.w, H / dims.h);
        pdf.addImage(pages[i].dataUrl, "JPEG", (W - dims.w * s) / 2, (H - dims.h * s) / 2, dims.w * s, dims.h * s);
      }
      const blob = pdf.output("blob");
      setPdfBlob(blob);
      setPdfSize(blob.size);
      setPdfUrl(URL.createObjectURL(blob));
      setMsg("PDF generated.");
    } catch {
      setMsg("Could not generate PDF. Please try again.");
    }
  }

  async function attach() {
    if (!pdfBlob || !assignmentId || !classId) return;
    setBusy(true);
    try {
      const file = new File([pdfBlob], "scan.pdf", { type: "application/pdf" });
      const up = await getUploadUrlAction(classId, assignmentId, { purpose: "submission", name: file.name, mime: file.type, size: file.size });
      const sb = createClient();
      const { error } = await sb.storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, file);
      if (error) throw new Error("Upload failed. Please try again.");
      sessionStorage.setItem("markley.staged", JSON.stringify({ path: up.path, name: file.name, mime: file.type, size: file.size, assignment_id: assignmentId }));
      router.push(`/dashboard/assignments/${assignmentId}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Attach failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="btn ghost" href={assignmentId ? `/dashboard/assignments/${assignmentId}` : "/dashboard/assignments"}>← Back</a>
          <div className="brand"><span className="brand-mark">M</span> Scan to PDF</div>
        </div>
      </header>
      <main className="container" style={{ padding: 16, display: "grid", gap: 16, maxWidth: 720 }}>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>1. Add pages</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => camRef.current?.click()}>Take photo</button>
            <button className="btn secondary" onClick={() => libRef.current?.click()}>Choose images</button>
            {!live ? <button className="btn secondary" onClick={startLive}>Live camera</button> : null}
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { [...(e.target.files ?? [])].forEach(addFile); e.target.value = ""; }} />
          <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { [...(e.target.files ?? [])].forEach(addFile); e.target.value = ""; }} />
          {live ? (
            <div style={{ marginTop: 12 }}>
              <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 12, background: "#000" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn" onClick={snap}>Capture</button>
                <button className="btn secondary" onClick={stopLive}>Close camera</button>
              </div>
            </div>
          ) : <video ref={videoRef} playsInline muted hidden />}
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Images are optimized on-device. Nothing uploads until you submit.</p>
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>2. Pages ({pages.length})</h2>
          {pages.length ? pages.map((p, i) => (
            <div key={p.id} className="card" style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, alignItems: "center", marginBottom: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt={`Page ${i + 1}`} style={{ width: 96, height: 128, objectFit: "cover", borderRadius: 8 }} />
              <div><b>Page {i + 1}</b>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button className="btn secondary" disabled={i === 0} onClick={() => move(p.id, -1)}>↑</button>
                  <button className="btn secondary" disabled={i === pages.length - 1} onClick={() => move(p.id, 1)}>↓</button>
                  <button className="btn secondary" onClick={() => openCrop(p.id)}>Crop</button>
                  <button className="btn ghost" onClick={() => { setPages((x) => x.filter((y) => y.id !== p.id)); setPdfUrl(null); }}>Remove</button>
                </div>
              </div>
            </div>
          )) : <div className="empty">No pages yet. Take a photo or choose images.</div>}
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>3. Generate PDF</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" disabled={!pages.length} onClick={generate}>Generate PDF</button>
            {pdfUrl ? <a className="btn secondary" href={pdfUrl} download="markley-scan.pdf">Download</a> : null}
            {pdfUrl && assignmentId ? <button className="btn secondary" disabled={busy} onClick={attach}>{busy ? "Attaching…" : "Attach to submission"}</button> : null}
          </div>
          {pdfUrl ? <p style={{ color: "var(--muted)" }}>Preview ({pages.length} pages, {formatBytes(pdfSize)})</p> : null}
          {pdfUrl ? <iframe src={pdfUrl} title="PDF preview" style={{ width: "100%", height: 480, border: "1px solid var(--border)", borderRadius: 12 }} /> : null}
          {msg ? <p>{msg}</p> : null}
        </section>
      </main>
      {cropId ? (
        <div className="modal-back open" style={{ display: "flex", position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
          <div className="modal" style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 520, width: "100%" }}>
            <h3 style={{ marginTop: 0 }}>Crop page</h3>
            <div style={{ maxHeight: "60vh", overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={cropImgRef} alt="Crop preview" style={{ maxWidth: "100%", display: "block" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={applyCrop}>Apply</button>
              <button className="btn secondary" onClick={() => { cropperRef.current?.destroy(); cropperRef.current = null; setCropId(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
