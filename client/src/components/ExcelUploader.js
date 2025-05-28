import React, { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
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
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import DeleteIcon from '@mui/icons-material/Delete';
import { requestVerificationAndDownloadZip } from '../services/zipService';

const ExcelUploader = () => {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [editMode, setEditMode] = useState(false);

  const [openDialog, setOpenDialog] = useState(false);
  const [projectName, setProjectName] = useState('');

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target.result;
      const workbook = XLSX.read(data, { type: 'binary' });
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
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
  });

  const handleCellChange = (value, rowIdx, colIdx) => {
    const updated = [...rows];
    updated[rowIdx][colIdx] = value;
    setRows(updated);
  };

  const handleDeleteRow = (rowIdx) => {
    const updated = [...rows];
    updated.splice(rowIdx, 1);
    setRows(updated);
  };

  const handleAddRow = () => {
    const emptyRow = headers.map(() => '');
    setRows(prev => [...prev, emptyRow]);
  };

  const handleVerifyButtonClick = () => {
    if (!rows.length) {
      alert('엑셀 파일을 업로드하세요.');
      return;
    }
    if (editMode) {
      alert('저장 후에 실행할 수 있습니다.');
      return;
    }
    setProjectName('');
    setOpenDialog(true);
  };

  const handleConfirmDownload = () => {
    setOpenDialog(false);
    const name = projectName.trim() || '무제프로젝트';
    const timestamp = getFormattedTimestamp();
    const zipName = `${name}_진위조회결과_${timestamp}.zip`;

    const dataObjects = rows.map(row => {
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = row[idx];
      });
      return obj;
    });

    requestVerificationAndDownloadZip(dataObjects, zipName);
  };

  const getFormattedTimestamp = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          1️⃣ 엑셀 업로드 (드래그 앤 드롭 지원)
        </Typography>

        <Box
          {...getRootProps()}
          sx={{
            border: '2px dashed #aaa',
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragActive ? '#f0f0f0' : '#fafafa',
            transition: '0.2s',
            mb: 3,
          }}
        >
          <input {...getInputProps()} />
          <Typography variant="body1" color="text.secondary">
            이곳에 엑셀 파일을 드래그하거나 클릭하여 업로드하세요 (.xlsx, .xls)
          </Typography>
        </Box>

        {rows.length > 0 && (
          <Box>
            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <Button variant="outlined" onClick={() => setEditMode(true)} disabled={editMode}>
                ✏️ 수정
              </Button>
              <Button variant="contained" onClick={() => setEditMode(false)} disabled={!editMode}>
                💾 저장
              </Button>
              <Button variant="contained" color="success" onClick={handleVerifyButtonClick} disabled={editMode}>
                📦 ZIP 다운로드
              </Button>
              {editMode && (
                <Button variant="outlined" color="primary" onClick={handleAddRow}>
                  ➕ 행 추가
                </Button>
              )}
            </Stack>

            <TableContainer component={Paper} sx={{ maxHeight: 400, overflow: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {headers.map((header, idx) => (
                      <TableCell key={idx}>{header}</TableCell>
                    ))}
                    {editMode && <TableCell />} {/* 삭제용 빈 헤더 */}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, rowIdx) => (
                    <TableRow key={rowIdx}>
                      {headers.map((_, colIdx) => (
                        <TableCell key={colIdx}>
                          {editMode ? (
                            <TextField
                              variant="standard"
                              value={row[colIdx] || ''}
                              onChange={(e) => handleCellChange(e.target.value, rowIdx, colIdx)}
                              fullWidth
                            />
                          ) : (
                            row[colIdx] !== undefined ? row[colIdx] : ''
                          )}
                        </TableCell>
                      ))}
                      {editMode && (
                        <TableCell>
                          <IconButton onClick={() => handleDeleteRow(rowIdx)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </CardContent>

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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>취소</Button>
          <Button variant="contained" onClick={handleConfirmDownload}>
            ZIP 다운로드
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default ExcelUploader;
