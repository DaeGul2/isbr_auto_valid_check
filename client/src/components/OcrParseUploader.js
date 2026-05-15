import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  CardHeader,
  Button,
  Stack,
  CircularProgress,
  Chip,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Tooltip,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useDropzone } from "react-dropzone";
import { uploadAndParseZip, downloadParsedExcel } from "../services/ocrParseService";

const FIELDS_BY_INST = {
  OPIC: ["passNum", "birth"],
  초본: ["passNum", "birth"],
  등본: ["passNum", "birth"],
  어학성적사전등록확인서: ["passNum", "birth"],
  건강보험자격득실확인서: ["passNum", "birth"],
  국민연금가입자증명: ["passNum", "birth", "extraNum", "issuedDate"],
  장애인증명서: ["passNum", "extraNum", "birth"],
  토익: ["passNum", "extraNum", "birth"],
  토플: ["passNum", "extraNum", "birth"],
  취업지원대상자증명서: ["passNum", "extraNum", "birth"],
};

const FIELD_LABELS = {
  passNum: "passNum",
  birth: "birth",
  extraNum: "extraNum",
  issuedDate: "issuedDate",
};

const SOURCE_LABELS = {
  regex: { label: "정규식", color: "default" },
  gpt: { label: "GPT", color: "warning" },
  shared: { label: "공유", color: "info" },
};

const INST_COLORS = {
  OPIC: "#1976d2",
  초본: "#2e7d32",
  등본: "#388e3c",
  어학성적사전등록확인서: "#7b1fa2",
  건강보험자격득실확인서: "#c62828",
  국민연금가입자증명: "#ef6c00",
  장애인증명서: "#5d4037",
  토익: "#0288d1",
  토플: "#00838f",
  취업지원대상자증명서: "#6a1b9a",
};

const FIELD_HIGHLIGHT_COLORS = {
  passNum: "#1976d2",
  birth: "#2e7d32",
  extraNum: "#ef6c00",
  issuedDate: "#7b1fa2",
};

function getFieldsFor(institution) {
  return FIELDS_BY_INST[institution] || ["passNum", "birth", "extraNum", "issuedDate"];
}

function findMatchedBoxes(value, pages) {
  if (!value) return [];
  const norm = (s) => String(s || "").replace(/\s/g, "").toLowerCase();
  const target = norm(value);
  const cleanTarget = target.replace(/[-./]/g, "");
  const matches = [];
  pages.forEach((page, pi) => {
    page.fields.forEach((f, fi) => {
      const t = norm(f.text);
      const tClean = t.replace(/[-./]/g, "");
      if (
        (target.length >= 3 && t.includes(target)) ||
        (cleanTarget.length >= 4 && tClean.includes(cleanTarget)) ||
        (cleanTarget.length >= 4 && tClean && cleanTarget.includes(tClean) && tClean.length >= 4)
      ) {
        matches.push({ pi, fi });
      }
    });
  });
  return matches;
}

const OcrParseUploader = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [zipName, setZipName] = useState("");
  const [detailRow, setDetailRow] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setZipName(file.name);
    setResults([]);
    setErrorMsg("");
    setLoading(true);
    try {
      const data = await uploadAndParseZip(file);
      setResults(data);
    } catch (e) {
      console.error(e);
      setErrorMsg(e?.response?.data?.error || e.message || "파싱 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
    multiple: false,
    disabled: loading,
  });

  // 기관별 그룹핑
  const grouped = useMemo(() => {
    const m = new Map();
    for (const r of results) {
      const k = r.institution || "(미분류)";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [results]);

  const handleDownloadExcel = async () => {
    if (!results.length) return;
    const base = zipName.replace(/\.zip$/i, "") || "parsed_results";
    await downloadParsedExcel(results, `${base}_파싱결과.xlsx`);
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          📦 제출서류 ZIP 업로드 (OCR + 파싱)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          ZIP 안의 PDF/이미지를 OCR(Naver Clova) → 정규식 파싱 → 누락 항목은 GPT 보강.
          기관별로 묶어서 표시.
        </Typography>

        <Box
          {...getRootProps()}
          sx={{
            border: "2px dashed #aaa",
            borderRadius: 2,
            p: 3,
            textAlign: "center",
            cursor: loading ? "not-allowed" : "pointer",
            backgroundColor: isDragActive ? "#f0f0f0" : "#fafafa",
            transition: "0.2s",
            mb: 3,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <input {...getInputProps()} />
          <Typography variant="body1" color="text.secondary">
            여기에 ZIP 파일을 드래그하거나 클릭해서 업로드 (.zip)
          </Typography>
          {zipName && (
            <Typography variant="caption" color="text.secondary">
              선택됨: {zipName}
            </Typography>
          )}
        </Box>

        {loading && (
          <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ ml: 1 }}>
              OCR + 파싱 진행 중... 파일 수에 따라 수십 초~수 분 소요됩니다.
            </Typography>
          </Box>
        )}

        {errorMsg && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              backgroundColor: "#fdecea",
              border: "1px solid #f5c2c0",
              borderRadius: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: "#a1271b" }}>
              ⚠️ {errorMsg}
            </Typography>
          </Box>
        )}

        {results.length > 0 && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}>
              <Chip color="success" label={`총 ${results.length}건`} />
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" color="success" onClick={handleDownloadExcel}>
                📥 엑셀 다운로드
              </Button>
            </Stack>

            {grouped.map(([inst, items]) => (
              <InstitutionGroup
                key={inst}
                institution={inst}
                items={items}
                onDetail={setDetailRow}
              />
            ))}
          </>
        )}
      </CardContent>

      <DetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
    </Card>
  );
};

function InstitutionGroup({ institution, items, onDetail }) {
  const color = INST_COLORS[institution] || "#666";
  return (
    <Accordion defaultExpanded sx={{ mb: 1, borderLeft: `4px solid ${color}` }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={institution}
            sx={{ backgroundColor: color, color: "white", fontWeight: 600 }}
          />
          <Typography variant="body2" color="text.secondary">
            {items.length}건
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={2}>
          {items.map((r, idx) => (
            <Grid item xs={12} sm={6} md={4} key={idx}>
              <ResultCard row={r} onDetail={onDetail} />
            </Grid>
          ))}
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
}

function ResultCard({ row, onDetail }) {
  const fields = getFieldsFor(row.institution).filter((f) => row[f]);
  const color = INST_COLORS[row.institution] || "#1976d2";
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderTop: `4px solid ${color}`,
      }}
    >
      <CardHeader
        sx={{ pb: 0 }}
        title={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {row.note && (
              <Chip label={row.note} size="small" variant="outlined" sx={{ fontSize: 11 }} />
            )}
          </Stack>
        }
        subheader={
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, wordBreak: "break-all" }}>
              {row.folder || "(폴더없음)"}
            </Typography>
            <Tooltip title={row.sourcePath} placement="bottom-start">
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                📄 {row.sourceFile}
              </Typography>
            </Tooltip>
          </Box>
        }
      />
      <CardContent sx={{ flex: 1, pt: 1 }}>
        <Stack spacing={1.2}>
          {fields.map((f) => {
            const src = row.sources?.[f];
            const srcMeta = src ? SOURCE_LABELS[src] : null;
            return (
              <Box key={f}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 78 }}>
                    {FIELD_LABELS[f] || f}
                  </Typography>
                  {srcMeta && (
                    <Chip
                      label={srcMeta.label}
                      size="small"
                      color={srcMeta.color}
                      sx={{ height: 16, fontSize: 10 }}
                    />
                  )}
                </Stack>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "monospace", fontWeight: 600, wordBreak: "break-all" }}
                >
                  {row[f]}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
      <CardActions>
        <Button size="small" onClick={() => onDetail(row)}>
          🔍 자세히 보기
        </Button>
      </CardActions>
    </Card>
  );
}

// =============== 자세히보기 ===============
function DetailDialog({ row, onClose }) {
  const matchMap = useMemo(() => {
    if (!row) return new Map();
    const m = new Map();
    const fields = getFieldsFor(row.institution).filter((f) => row[f]);
    for (const f of fields) {
      const matches = findMatchedBoxes(row[f], row.ocrPages || []);
      for (const { pi, fi } of matches) {
        const key = `${pi}:${fi}`;
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(f);
      }
    }
    return m;
  }, [row]);

  if (!row) return null;
  const fields = getFieldsFor(row.institution).filter((f) => row[f]);
  const color = INST_COLORS[row.institution] || "#1976d2";

  return (
    <Dialog open={!!row} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ borderTop: `4px solid ${color}` }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={row.institution}
            sx={{ backgroundColor: color, color: "white", fontWeight: 600 }}
          />
          <Typography variant="subtitle1">{row.folder || "(폴더없음)"}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
          {row.sourcePath}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2" gutterBottom>
          🎯 추출된 항목
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}>
          {fields.map((f) => {
            const src = row.sources?.[f];
            const srcMeta = src ? SOURCE_LABELS[src] : null;
            return (
              <Paper
                key={f}
                variant="outlined"
                sx={{
                  px: 1.5,
                  py: 1,
                  borderLeft: `4px solid ${FIELD_HIGHLIGHT_COLORS[f] || "#888"}`,
                  minWidth: 180,
                }}
              >
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    {FIELD_LABELS[f] || f}
                  </Typography>
                  {srcMeta && (
                    <Chip
                      label={srcMeta.label}
                      size="small"
                      color={srcMeta.color}
                      sx={{ height: 16, fontSize: 10 }}
                    />
                  )}
                </Stack>
                <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                  {row[f]}
                </Typography>
              </Paper>
            );
          })}
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          🟦 원본 위 OCR 박스 시각화
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap" }}>
          {fields.map((f) => (
            <Chip
              key={f}
              size="small"
              label={`${FIELD_LABELS[f] || f}`}
              sx={{
                backgroundColor: FIELD_HIGHLIGHT_COLORS[f] || "#888",
                color: "white",
              }}
            />
          ))}
        </Stack>

        <DocumentVisualizer row={row} matchMap={matchMap} />

        <Divider sx={{ my: 2 }} />
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 8 }}>
            📜 OCR 텍스트 전문
          </summary>
          <Box
            sx={{
              p: 2,
              backgroundColor: "#fafafa",
              border: "1px solid #ddd",
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {row.ocrText}
          </Box>
        </details>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}

function DocumentVisualizer({ row, matchMap }) {
  const ext = (row.fileExt || "").toLowerCase();
  if (!row.fileBase64) {
    return <FallbackBoxes row={row} matchMap={matchMap} />;
  }
  if (ext === "pdf") {
    return <PdfOverlay row={row} matchMap={matchMap} />;
  }
  if (["png", "jpg", "jpeg"].includes(ext)) {
    return <ImageOverlay row={row} matchMap={matchMap} />;
  }
  return <FallbackBoxes row={row} matchMap={matchMap} />;
}

function ImageOverlay({ row, matchMap }) {
  const dataUrl = `data:image/${row.fileExt === "jpeg" ? "jpg" : row.fileExt};base64,${row.fileBase64}`;
  const page = row.ocrPages?.[0];
  const W = page?.width || 0;
  const H = page?.height || 0;
  return (
    <PageBoxOverlay
      page={page}
      pageIndex={0}
      matchMap={matchMap}
      width={W}
      height={H}
      backgroundUrl={dataUrl}
    />
  );
}

function PdfOverlay({ row, matchMap }) {
  const [renderedPages, setRenderedPages] = useState([]);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let active = true;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const pdfjsVersion = pdfjs.version;
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

        const bin = atob(row.fileBase64);
        const len = bin.length;
        const buf = new Uint8Array(len);
        for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);

        const loadingTask = pdfjs.getDocument({ data: buf });
        const pdf = await loadingTask.promise;
        const out = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelRef.current) break;
          const page = await pdf.getPage(i);
          const ocrPage = row.ocrPages?.[i - 1];
          const targetW = ocrPage?.width || 1240;
          const initialViewport = page.getViewport({ scale: 1 });
          const scale = targetW / initialViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const dataUrl = canvas.toDataURL("image/png");
          out.push({ dataUrl, width: viewport.width, height: viewport.height });
          if (!active) return;
        }
        if (active && !cancelRef.current) setRenderedPages(out);
      } catch (e) {
        console.error(e);
        if (active) setError(e.message || "PDF 렌더링 실패");
      }
    })();
    return () => {
      active = false;
      cancelRef.current = true;
    };
  }, [row.fileBase64]);

  if (error) {
    return (
      <Box>
        <Typography variant="caption" color="error">
          PDF 렌더링 실패: {error} (박스만 표시)
        </Typography>
        <FallbackBoxes row={row} matchMap={matchMap} />
      </Box>
    );
  }
  if (!renderedPages.length) {
    return (
      <Box display="flex" alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="caption" sx={{ ml: 1 }}>
          PDF 렌더링 중...
        </Typography>
      </Box>
    );
  }

  return (
    <>
      {renderedPages.map((rp, pi) => {
        const ocrPage = row.ocrPages?.[pi];
        return (
          <PageBoxOverlay
            key={pi}
            page={ocrPage}
            pageIndex={pi}
            matchMap={matchMap}
            width={rp.width}
            height={rp.height}
            backgroundUrl={rp.dataUrl}
          />
        );
      })}
    </>
  );
}

function PageBoxOverlay({ page, pageIndex, matchMap, width, height, backgroundUrl }) {
  if (!width || !height || !page) return null;
  const W = width;
  const H = height;
  const maxDisplay = 900;
  const scale = Math.min(maxDisplay / W, 1);
  const ocrW = page.width || W;
  const ocrH = page.height || H;
  const sx = W / ocrW;
  const sy = H / ocrH;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary">
        Page {pageIndex + 1} ({Math.round(W)} × {Math.round(H)})
      </Typography>
      <Box
        sx={{
          position: "relative",
          width: W * scale,
          maxWidth: "100%",
          border: "1px solid #ccc",
          backgroundColor: "#fff",
        }}
      >
        <img
          src={backgroundUrl}
          alt={`page-${pageIndex + 1}`}
          style={{ display: "block", width: W * scale, height: H * scale }}
        />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W * scale}
          height={H * scale}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          {page.fields.map((f, fi) => {
            const verts = f.vertices || [];
            if (verts.length < 3) return null;
            const xs = verts.map((v) => v.x * sx);
            const ys = verts.map((v) => v.y * sy);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            const w = Math.max(...xs) - x;
            const h = Math.max(...ys) - y;
            const matched = matchMap.get(`${pageIndex}:${fi}`);
            const isMatched = matched && matched.length > 0;
            if (!isMatched) {
              return (
                <rect
                  key={fi}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="rgba(120,120,120,0.35)"
                  strokeWidth={1}
                />
              );
            }
            const fieldKey = matched[0];
            const stroke = FIELD_HIGHLIGHT_COLORS[fieldKey] || "#d32f2f";
            return (
              <g key={fi}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={`${stroke}33`}
                  stroke={stroke}
                  strokeWidth={3}
                />
                <text
                  x={x}
                  y={y - 4}
                  fontSize={Math.max(12, h * 0.5)}
                  fill={stroke}
                  fontWeight={700}
                  style={{ fontFamily: "sans-serif" }}
                >
                  {fieldKey}
                </text>
              </g>
            );
          })}
        </svg>
      </Box>
    </Box>
  );
}

function FallbackBoxes({ row, matchMap }) {
  return (
    <>
      {(row.ocrPages || []).map((page, pi) => {
        if (!page.width || !page.height) return null;
        const W = page.width;
        const H = page.height;
        const maxDisplay = 900;
        const scale = Math.min(maxDisplay / W, 1);
        return (
          <Box key={pi} sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Page {pi + 1} ({W} × {H})
            </Typography>
            <Box
              sx={{
                width: W * scale,
                maxWidth: "100%",
                border: "1px solid #ccc",
                backgroundColor: "#fff",
              }}
            >
              <svg viewBox={`0 0 ${W} ${H}`} width={W * scale} height={H * scale}>
                <rect x={0} y={0} width={W} height={H} fill="#fafafa" />
                {page.fields.map((f, fi) => {
                  const verts = f.vertices || [];
                  if (verts.length < 3) return null;
                  const xs = verts.map((v) => v.x);
                  const ys = verts.map((v) => v.y);
                  const x = Math.min(...xs);
                  const y = Math.min(...ys);
                  const w = Math.max(...xs) - x;
                  const h = Math.max(...ys) - y;
                  const matched = matchMap.get(`${pi}:${fi}`);
                  const isMatched = matched && matched.length > 0;
                  const fieldKey = isMatched ? matched[0] : null;
                  const stroke = isMatched
                    ? FIELD_HIGHLIGHT_COLORS[fieldKey] || "#d32f2f"
                    : "#bbb";
                  const fill = isMatched ? `${stroke}33` : "rgba(0,0,0,0.02)";
                  const fontSize = Math.max(8, Math.min(h * 0.55, 22));
                  return (
                    <g key={fi}>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={isMatched ? 3 : 1}
                      />
                      <text
                        x={x + 2}
                        y={y + h * 0.78}
                        fontSize={fontSize}
                        fill={isMatched ? stroke : "#444"}
                        fontWeight={isMatched ? 700 : 400}
                        style={{ fontFamily: "monospace" }}
                      >
                        {f.text}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </Box>
          </Box>
        );
      })}
    </>
  );
}

export default OcrParseUploader;
