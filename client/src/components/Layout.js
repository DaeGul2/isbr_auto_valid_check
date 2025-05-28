import React from 'react';
import { AppBar, Toolbar, Typography, Container, Box } from '@mui/material';

const Layout = ({ children }) => {
  return (
    <>
      <AppBar position="static" color="primary" sx={{ mb: 4 }}>
        <Toolbar>
          <Typography variant="h6" component="div">
            📑 진위 확인 자동화 시스템
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl">
        <Box sx={{ mb: 6 }}>
          <Typography variant="h5" gutterBottom>
            엑셀 기반 진위 확인을 자동화합니다.
          </Typography>
          <Typography variant="body1" color="text.secondary">
            아래에서 엑셀 파일을 업로드하고, 결과를 확인해보세요.
          </Typography>
        </Box>

        {children}
      </Container>
    </>
  );
};

export default Layout;
