import axios from "axios";
const LOG_API_URL = process.env.REACT_APP_LOG_API_URL; // e.g. http://localhost:5050/api/log

export async function sendBatchLog({ userName, peopleCount, institutionCount, status }) {
  try {
    await axios.post(LOG_API_URL, {
      userName,
      peopleCount,
      institutionCount,
      status,
    });
  } catch (err) {
    console.error("배치 로그 전송 실패:", err);
  }
}
