import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './lib/queryClient.js';
import { useAuthStore } from './store/authStore.js';
import { useConfigStore } from './store/configStore.js';
import { ToastProvider } from './components/common/index.js';
import AppRoutes from './routes/AppRoutes.jsx';

export function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const loadConfig = useConfigStore((state) => state.load);

  useEffect(() => {
    bootstrap();
    // Pull public runtime config (e.g. the Google client id) from the server so
    // it never needs to be set in the client's own env.
    loadConfig();
  }, [bootstrap, loadConfig]);

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
