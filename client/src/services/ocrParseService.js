import axios from "axios";
import { saveAs } from "file-saver";

const OCR_PARSE_API_URL =
  process.env.REACT_APP_OCR_PARSE_API_URL || "/api/ocr-parse";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const base64 = String(result).split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadAndParseZip(file) {
  const zipBase64 = await fileToBase64(file);
  const res = await axios.post(
    `${OCR_PARSE_API_URL}/parse`,
    { zipBase64 },
    {
      timeout: 600000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );
  return res.data?.data || [];
}

export async function downloadParsedExcel(results, fileName = "parsed_results.xlsx") {
  const res = await axios.post(
    `${OCR_PARSE_API_URL}/excel`,
    { results },
    {
      responseType: "blob",
      timeout: 600000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );
  const blob = new Blob([res.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(blob, fileName);
}
