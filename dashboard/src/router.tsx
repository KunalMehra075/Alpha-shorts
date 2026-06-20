import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout';
import { HomePage } from '@/pages/HomePage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { ScriptPage } from '@/pages/ScriptPage';
import { AudioPage } from '@/pages/AudioPage';
import { CaptionPage } from '@/pages/CaptionPage';
import { VideoPage } from '@/pages/VideoPage';
import { UploadPage } from '@/pages/UploadPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'templates', element: <TemplatesPage /> },
      {
        path: 'w/:id',
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <Navigate to="script" replace /> },
          { path: 'script', element: <ScriptPage /> },
          { path: 'audio', element: <AudioPage /> },
          { path: 'caption', element: <CaptionPage /> },
          { path: 'video', element: <VideoPage /> },
          { path: 'upload', element: <UploadPage /> }
        ]
      },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
]);
