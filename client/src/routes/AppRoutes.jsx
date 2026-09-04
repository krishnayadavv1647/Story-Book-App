import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './RequireAuth.jsx';
import RedirectIfAuthenticated from './RedirectIfAuthenticated.jsx';
import SignInPage from '../pages/SignInPage.jsx';
import SignUpPage from '../pages/SignUpPage.jsx';
import ForgotPasswordPage from '../pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from '../pages/ResetPasswordPage.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';
import StoryAgentPage from '../pages/StoryAgentPage.jsx';
import StoryPlanPage from '../pages/StoryPlanPage.jsx';
import CharactersPage from '../pages/CharactersPage.jsx';
import BookGenerationPage from '../pages/BookGenerationPage.jsx';
import BookEditorPage from '../pages/BookEditorPage.jsx';
import BookPreviewPage from '../pages/BookPreviewPage.jsx';
import BookReaderPage from '../pages/BookReaderPage.jsx';
import MyBooksPage from '../pages/MyBooksPage.jsx';
import NotificationsPage from '../pages/NotificationsPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import CharacterLibraryPage from '../pages/CharacterLibraryPage.jsx';
import AdminPage from '../pages/AdminPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

/**
 * The design-system reference is a development affordance, not product surface.
 * It is lazily imported and registered only in dev, so it stays out of the
 * production route table and out of the main bundle.
 */
const DesignSystemPage = lazy(() => import('../pages/DesignSystemPage.jsx'));

/**
 * Route table. Feature routes are added by the phase that builds them — see the
 * task graph — rather than being stubbed out ahead of time. Sidebar destinations
 * whose phase has not landed resolve to the not-found page.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Signed-in users are bounced away from the auth screens. */}
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      {/* Reachable while signed in: the link ends every other session. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {import.meta.env.DEV && (
        <Route
          path="/design-system"
          element={
            <Suspense fallback={null}>
              <DesignSystemPage />
            </Suspense>
          }
        />
      )}

      <Route
        path="/"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />

      <Route
        path="/agent"
        element={
          <RequireAuth>
            <StoryAgentPage />
          </RequireAuth>
        }
      />

      <Route
        path="/books/:bookId/plan"
        element={
          <RequireAuth>
            <StoryPlanPage />
          </RequireAuth>
        }
      />

      <Route
        path="/books/:bookId/characters"
        element={
          <RequireAuth>
            <CharactersPage />
          </RequireAuth>
        }
      />

      <Route
        path="/books/:bookId/generate"
        element={
          <RequireAuth>
            <BookGenerationPage />
          </RequireAuth>
        }
      />

      <Route
        path="/books/:bookId/editor"
        element={
          <RequireAuth>
            <BookEditorPage />
          </RequireAuth>
        }
      />

      <Route
        path="/books/:bookId/preview"
        element={
          <RequireAuth>
            <BookPreviewPage />
          </RequireAuth>
        }
      />

      {/* The book filling the browser, with none of the app around it. Still
          behind the guard: it is the owner's book, not a public page. */}
      <Route
        path="/books/:bookId/read"
        element={
          <RequireAuth>
            <BookReaderPage />
          </RequireAuth>
        }
      />

      <Route
        path="/books"
        element={
          <RequireAuth>
            <MyBooksPage />
          </RequireAuth>
        }
      />

      <Route
        path="/published"
        element={
          <RequireAuth>
            <MyBooksPage onlyPublished />
          </RequireAuth>
        }
      />

      <Route
        path="/characters"
        element={
          <RequireAuth>
            <CharacterLibraryPage />
          </RequireAuth>
        }
      />


      <Route
        path="/notifications"
        element={
          <RequireAuth>
            <NotificationsPage />
          </RequireAuth>
        }
      />

      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />

      {/* Not in the sidebar by design: an operations screen is not customer
          navigation. The server refuses these requests for a non-admin. */}
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPage />
          </RequireAuth>
        }
      />

      {/* Previewing needs a book chosen first. */}
      <Route path="/preview" element={<Navigate to="/books" replace />} />

      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      {/* "Create Storybook" in the sidebar is the agent conversation. */}
      <Route path="/create" element={<Navigate to="/agent" replace />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default AppRoutes;
