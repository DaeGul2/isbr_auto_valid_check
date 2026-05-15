import React, { useState } from 'react';
import Layout from './components/Layout';
import ExcelUploader from './components/ExcelUploader';
import OcrParseUploader from './components/OcrParseUploader';
import { CssBaseline, Tabs, Tab, Box } from '@mui/material';

function App() {
  const [tab, setTab] = useState(0);

  return (
    <>
      <CssBaseline />
      <Layout>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="진위조회 (엑셀)" />
            <Tab label="제출서류 OCR 파싱 (ZIP)" />
          </Tabs>
        </Box>

        {tab === 0 && <ExcelUploader />}
        {tab === 1 && <OcrParseUploader />}
      </Layout>
    </>
  );
}

export default App;
