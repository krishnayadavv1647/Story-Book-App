import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './lib/queryClient.js';
import { useAuthStore } from './store/authStore.js';
import { ToastProvider } from './components/common/index.js';
import AppRoutes from './routes/AppRoutes.jsx';

export function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
