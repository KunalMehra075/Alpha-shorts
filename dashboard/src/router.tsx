import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { ProjectLayout } from '@/layouts/ProjectLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { AssetsPage } from '@/pages/AssetsPage';
import { AudiosPage } from '@/pages/AudiosPage';
import { ElementsPage } from '@/pages/ElementsPage';
import { PromptsPage } from '@/pages/PromptsPage';
import { ScriptPage } from '@/pages/ScriptPage';
import { AudioPage } from '@/pages/AudioPage';
import { CaptionPage } from '@/pages/CaptionPage';
import { AssetPage } from '@/pages/AssetPage';
import { VideoEditorPage } from '@/pages/VideoEditorPage';
import { UploadPage } from '@/pages/UploadPage';
import { ProjectAnalyticsPage } from '@/pages/ProjectAnalyticsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'audios', element: <AudiosPage /> },
      { path: 'elements', element: <ElementsPage /> },
      { path: 'prompts', element: <PromptsPage /> },
      // Back-compat: old /templates path → Prompts
      { path: 'templates', element: <Navigate to="/prompts" replace /> },
      {
        path: 'w/:id',
        element: <ProjectLayout />,
        children: [
          { index: true, element: <Navigate to="script" replace /> },
          { path: 'script', element: <ScriptPage /> },
          { path: 'audio', element: <AudioPage /> },
          { path: 'caption', element: <CaptionPage /> },
          { path: 'assets', element: <AssetPage /> },
          { path: 'video', element: <VideoEditorPage /> },
          { path: 'upload', element: <UploadPage /> },
          { path: 'analytics', element: <ProjectAnalyticsPage /> }
        ]
      },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
]);
