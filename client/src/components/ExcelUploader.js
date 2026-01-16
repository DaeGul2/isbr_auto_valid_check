import React, { useCallback, useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import guideData from "../assets/guide.md.json";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Checkbox,
  CircularProgress,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material";
import { useDropzone } from "react-dropzone";
import DeleteIcon from "@mui/icons-material/Delete";
import { verifyInChunks, requestZipDownload } from "../services/zipService";
import { sendBatchLog } from "../services/logService"; // 로그 전송 함수

const validInstitutions = [
  "한국세무사회",
  "대한상공회의소",
  "국사편찬위원회",
  "한국생산성본부",
  "OPIC",
  "초본",
  "성적증명서",
  "졸업증명서",
  "등본",
  "어학성적 사전등록 확인서",
  "건강보험자격득실확인서",
  "국민연금가입자증명",
];
const normalizedValid = validInstitutions.map((inst) =>
  inst.replace(/\s/g, "").toLowerCase()
);

// ✅ birth를 "무조건 필수"에서 제거 (국사는 옵션 선택 가능)
const requiredColumns = [
  "registerationNumber",
  "name",
  "institution",
  "passNum",
  "certificateName",
  // "birth", // ✅ 제거
];

const normInst = (v) => String(v || "").replace(/\s/g, "").trim().toLowerCase();
const isHanguksa = (inst) => normInst(inst) === "국사편찬위원회".replace(/\s/g, "").toLowerCase();

const ExcelUploader = () => {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [openDialog, setOpenDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [openGuide, setOpenGuide] = useState(false);
  const [userName, setUserName] = useState("");

  const [checkedIndices, setCheckedIndices] = useState([]);

  // ✅ 이번 실행에서 국사편찬위원회 모드 선택
  // withBirth: 기존 로직 (birth 포함)
  // noBirth: birth 없이 조회 (userNm/authCd)
  const [hanguksaMode, setHanguksaMode] = useState("withBirth"); // default

  const selectedRows = useMemo(() => checkedIndices.map((i) => rows[i]), [checkedIndices, rows]);

  const hasHanguksaSelected = useMemo(() => {
    if (!headers.length || !rows.length) return false;
    const loweredHeaders = headers.map((h) => String(h).toLowerCase().trim());
    const institutionIdx = loweredHeaders.indexOf("institution");
    if (institutionIdx === -1) return false;
    return selectedRows.some((r) => isHanguksa(r[institutionIdx]));
  }, [headers, rows.length, selectedRows]);

  const validateData = useCallback((headerRow, rowData) => {
    const newWarnings = [];
    const newRowErrors = {};

    // 필수 컬럼 검사 (원본 이름 기준)
    const missing = requiredColumns.filter((col) => !headerRow.includes(col));
    if (missing.length > 0) {
      newWarnings.push(`❗ 필수 컬럼명이 포함되어있는지 확인하세요. 누락된 컬럼: ${missing.join(", ")}`);
    }

    const loweredHeaders = headerRow.map((h) => String(h).toLowerCase().trim());
    const institutionIdx = loweredHeaders.indexOf("institution");
    const birthIdx = loweredHeaders.indexOf("birth"); // ✅ 있을 수도, 없을 수도
    const passNumIdx = loweredHeaders.indexOf("passnum");
    const issuedDateIdx = loweredHeaders.indexOf("issueddate");

    // 각 행 유효성 검사
    rowData.forEach((row, idx) => {
      const issues = [];
      const instRaw = row[institutionIdx] || "";
      const inst = normInst(instRaw);

      // ✅ 유효 기관인지
      if (institutionIdx !== -1 && !normalizedValid.includes(inst)) {
        issues.push("지원 불가능한 institution 값입니다.");
      }

      // ✅ 한국생산성본부는 birth 필수 유지
      const isKpc = inst === normInst("한국생산성본부");
      if (isKpc) {
        if (birthIdx === -1) {
          issues.push("birth 컬럼이 필요합니다. (한국생산성본부)");
        } else if (!row[birthIdx]) {
          issues.push("birth 값이 필요합니다. (한국생산성본부)");
        }
      }

      // ✅ 국민연금가입자증명 규칙
      if (inst === normInst("국민연금가입자증명")) {
        const passNum = row[passNumIdx] || "";
        const isGov24 = /^\d{4,5}-\d{4,5}-\d{4,5}-\d{4,5}$/.test(passNum);

        const extraNum = row[loweredHeaders.indexOf("extranum")] || "";
        if (!extraNum) {
          issues.push("extraNum(추가 기입 정보) 값이 필요합니다.");
        }

        if (!isGov24) {
          const issuedDate = row[issuedDateIdx];
          if (!issuedDate) {
            issues.push("issuedDate(발급일) 값이 필요합니다.");
          }
        }
      }

      if (issues.length) newRowErrors[idx] = issues;
    });

    Object.entries(newRowErrors).forEach(([idx, issues]) => {
      newWarnings.push(`❗ ${Number(idx) + 1}행: ${issues.join(", ")}`);
    });

    setWarnings(newWarnings);
    setRowErrors(newRowErrors);
  }, []);

  useEffect(() => {
    if (headers.length > 0 && rows.length > 0) {
      const selected = checkedIndices.map((i) => rows[i]);
      validateData(headers, selected);
    }
  }, [headers, rows, checkedIndices, editMode, validateData]);

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const [headerRow, ...rowData] = json;
      setHeaders(headerRow);
      setRows(rowData);
      setEditMode(false);
    };
    reader.readAsBinaryString(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
  });

  const toggleCheckRow = (index) => {
    setCheckedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const checkAll = () => {
    setCheckedIndices(rows.map((_, idx) => idx));
  };

  const uncheckAll = () => {
    setCheckedIndices([]);
  };

  const handleCellChange = (value, rowIdx, colIdx) => {
    const updated = [...rows];
    updated[rowIdx][colIdx] = value;
    setRows(updated);
  };

  const handleHeaderChange = (value, colIdx) => {
    const updated = [...headers];
    updated[colIdx] = value;
    setHeaders(updated);
  };

  const handleDeleteRow = (rowIdx) => {
    const updated = [...rows];
    updated.splice(rowIdx, 1);
    setRows(updated);
  };

  const handleAddRow = () => {
    const emptyRow = headers.map(() => "");
    setRows((prev) => [...prev, emptyRow]);
  };

  const handleVerifyButtonClick = () => {
    if (!rows.length) {
      alert("엑셀 파일을 업로드하세요.");
      return;
    }
    if (editMode) {
      alert("저장 후에 실행할 수 있습니다.");
      return;
    }
    if (warnings.length > 0) {
      alert("경고 메시지를 먼저 해결해주세요.");
      return;
    }
    if (checkedIndices.length === 0) {
      alert("조회할 행을 선택하세요.");
      return;
    }

    setProjectName("");
    // ✅ 국사 선택된 경우에만 선택 UI 뜨니까 기본값 유지
    setHanguksaMode("withBirth");
    setOpenDialog(true);
  };

  const getFormattedTimestamp = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(
      now.getHours()
    )}-${pad(now.getMinutes())}`;
  };

  const handleConfirmAndStartVerify = async () => {
    // ✅ 국사편찬위원회 + withBirth 선택했는데 birth 없으면 막기
    if (hasHanguksaSelected && hanguksaMode === "withBirth") {
      const loweredHeaders = headers.map((h) => String(h).toLowerCase().trim());
      const institutionIdx = loweredHeaders.indexOf("institution");
      const birthIdx = loweredHeaders.indexOf("birth");

      if (birthIdx === -1) {
        alert("국사편찬위원회(생년월일 있는 버전) 선택 시 birth 컬럼이 필요합니다.");
        return;
      }

      const bad = selectedRows.some((r) => isHanguksa(r[institutionIdx]) && !r[birthIdx]);
      if (bad) {
        alert("국사편찬위원회(생년월일 있는 버전) 선택 시 birth 값이 비어있으면 안됩니다.");
        return;
      }
    }

    setOpenDialog(false);

    const name = projectName.trim() || "무제프로젝트";
    const user = userName.trim() || "이름없음";
    const timestamp = getFormattedTimestamp();
    const zipName = `${name}_진위조회결과_${timestamp}.zip`;

    // 체크된 행 -> 객체 변환
    const dataObjects = checkedIndices.map((index) => {
      const row = rows[index];
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx];
      });
      obj._index = index;
      return obj;
    });

    // 처리중 표기
    setRows((prev) => {
      const updated = [...prev];
      dataObjects.forEach((obj) => {
        updated[obj._index].__status = "⏳ 처리중";
      });
      return updated;
    });

    // ✅ 병렬 검증 (hanguksaMode 같이 보냄)
    const allResults = [];
    await verifyInChunks(
      dataObjects,
      user,
      3,
      (responses) => {
        setRows((prev) => {
          const updated = [...prev];
          responses.forEach((r) => {
            updated[r._index].__status = r.result === 1 ? "✅ 성공" : "❌ 실패";
          });
          return updated;
        });
        allResults.push(...responses);
      },
      zipName,
      hanguksaMode
    );

    // 로그 집계
    const peopleCount = allResults.length;
    const institutionCount = allResults.reduce((acc, r) => {
      acc[r.institution] = (acc[r.institution] || 0) + 1;
      return acc;
    }, {});
    const status = allResults.some((r) => r.result === 0) ? 0 : 1;

    await sendBatchLog({
      userName: user,
      peopleCount,
      institutionCount,
      status,
    });

    await requestZipDownload(zipName);
  };

  return (
    <Card variant="outlined">
      <Button variant="outlined" component="a" href="/sample-template.xlsx" download sx={{ mb: 2 }}>
        📥 양식 엑셀 파일 다운로드
      </Button>

      <CardContent>
        <IconButton onClick={() => setOpenGuide(true)}>사용법을 모르시나요❓</IconButton>

        <Typography variant="h6" gutterBottom>
          1️⃣ 엑셀 업로드 (드래그 앤 드롭 지원)
        </Typography>

        <Box
          {...getRootProps()}
          sx={{
            border: "2px dashed #aaa",
            borderRadius: 2,
            p: 3,
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: isDragActive ? "#f0f0f0" : "#fafafa",
            transition: "0.2s",
            mb: 3,
          }}
        >
          <input {...getInputProps()} />
          <Typography variant="body1" color="text.secondary">
            이곳에 엑셀 파일을 드래그하거나 클릭하여 업로드하세요 (.xlsx, .xls)
          </Typography>
        </Box>

        {warnings.length > 0 && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              backgroundColor: "#fff3cd",
              border: "1px solid #ffeeba",
              borderRadius: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ color: "#856404" }}>
              ⚠️ 경고
            </Typography>
            <ul style={{ paddingLeft: "1rem", margin: 0 }}>
              {warnings.map((w, i) => (
                <li key={i} style={{ fontSize: "0.85rem" }}>
                  {w}
                </li>
              ))}
            </ul>
          </Box>
        )}

        {rows.length > 0 && (
          <Box>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={() => setEditMode(true)} disabled={editMode}>
                ✏️ 수정
              </Button>
              <Button variant="contained" onClick={() => setEditMode(false)} disabled={!editMode}>
                💾 저장
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={handleVerifyButtonClick}
                disabled={editMode || warnings.length > 0 || checkedIndices.length === 0}
              >
                📦 진위조회 실행
              </Button>
              <Button variant="outlined" onClick={checkAll}>
                ✅ 전체 선택
              </Button>
              <Button variant="outlined" onClick={uncheckAll}>
                🚫 전체 해제
              </Button>
              {editMode && (
                <Button variant="outlined" color="primary" onClick={handleAddRow}>
                  ➕ 행 추가
                </Button>
              )}
            </Stack>

            <TableContainer component={Paper} sx={{ maxHeight: 400, overflow: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">✔</TableCell>
                    <TableCell>행번호</TableCell>
                    {headers.map((header, idx) => (
                      <TableCell key={idx}>
                        {editMode ? (
                          <TextField
                            variant="standard"
                            value={header}
                            onChange={(e) => handleHeaderChange(e.target.value, idx)}
                            fullWidth
                          />
                        ) : (
                          header
                        )}
                      </TableCell>
                    ))}
                    <TableCell>결과</TableCell>
                    {editMode && <TableCell />}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.map((row, rowIdx) => (
                    <Tooltip
                      key={rowIdx}
                      title={rowErrors[rowIdx]?.join(", ") || ""}
                      arrow
                      placement="right"
                    >
                      <TableRow sx={rowErrors[rowIdx] ? { backgroundColor: "#ffe6e6" } : {}}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={checkedIndices.includes(rowIdx)}
                            onChange={() => toggleCheckRow(rowIdx)}
                          />
                        </TableCell>

                        <TableCell>{rowIdx + 1}</TableCell>

                        {headers.map((_, colIdx) => (
                          <TableCell key={colIdx}>
                            {editMode ? (
                              <TextField
                                variant="standard"
                                value={row[colIdx] || ""}
                                onChange={(e) => handleCellChange(e.target.value, rowIdx, colIdx)}
                                fullWidth
                              />
                            ) : (
                              row[colIdx] || ""
                            )}
                          </TableCell>
                        ))}

                        <TableCell>
                          {row.__status === "⏳ 처리중" ? (
                            <Box display="flex" alignItems="center">
                              <CircularProgress size={18} />
                              <Typography variant="body2" sx={{ ml: 1 }}>
                                처리중
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2">{row.__status || "-"}</Typography>
                          )}
                        </TableCell>

                        {editMode && (
                          <TableCell>
                            <IconButton onClick={() => handleDeleteRow(rowIdx)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    </Tooltip>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </CardContent>

      {/* ✅ 실행 다이얼로그 */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>📁 프로젝트명 입력</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="프로젝트명"
            fullWidth
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="사용자명"
            fullWidth
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />

          {/* ✅ 국사편찬위원회 선택된 경우만 노출 */}
          {hasHanguksaSelected && (
            <Box sx={{ mt: 2 }}>
              <FormControl>
                <FormLabel>국사편찬위원회 조회 방식</FormLabel>
                <RadioGroup
                  value={hanguksaMode}
                  onChange={(e) => setHanguksaMode(e.target.value)}
                >
                  <FormControlLabel value="withBirth" control={<Radio />} label="생년월일 있는 버전" />
                  <FormControlLabel value="noBirth" control={<Radio />} label="생년월일 없는 버전" />
                </RadioGroup>
              </FormControl>
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>취소</Button>
          <Button variant="contained" onClick={handleConfirmAndStartVerify}>
            ZIP 다운로드
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openGuide} onClose={() => setOpenGuide(false)} maxWidth="lg" fullWidth>
        <DialogTitle>📘 사용법 안내</DialogTitle>
        <DialogContent
          dividers
          sx={{
            maxHeight: 600,
            overflowY: "auto",
          }}
        >
          <Box
            component="div"
            sx={{
              whiteSpace: "pre-wrap",
              overflowX: "auto",
              "& table": {
                borderCollapse: "collapse",
                width: "100%",
                marginBottom: 2,
              },
              "& th, & td": {
                border: "1px solid #ccc",
                padding: "8px",
                textAlign: "left",
              },
              "& th": {
                backgroundColor: "#f5f5f5",
              },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{guideData.content}</ReactMarkdown>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenGuide(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default ExcelUploader;
