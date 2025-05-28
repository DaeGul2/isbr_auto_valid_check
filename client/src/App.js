import React from 'react';
import Layout from './components/Layout';
import ExcelUploader from './components/ExcelUploader';
import { CssBaseline } from '@mui/material';

function App() {
  return (
    <>
      <CssBaseline />
      <Layout>
        <ExcelUploader />
      </Layout>
    </>
  );
}

export default App;
