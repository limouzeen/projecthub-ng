import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },

  { path: 'about', loadComponent: () => import('./pages/about/about').then(m => m.About) },
  {
    path: 'profile/edit',
    loadComponent: () => import('./pages/edit-profile/edit-profile').then((m) => m.EditProfile),
  },
  {
    path: 'projects/:projectId',loadComponent: () =>
import('./pages/project-detail/project-detail').then((m) => m.ProjectDetail),
  },

{ path: 'table/:id', loadComponent: () => import('./pages/table-view/table-view').then(m => m.TableView) },


  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },

  // หน้า Table Detail (ขยายดูตารางเต็ม)
  // {
  //   path: 'projects/:projectId/tables/:tableId',
  //   loadComponent: () => import('./pages/table-detail/table-detail').then(m => m.TableDetail),
  // },

  // Fallback 404
  // {
  //   path: '**',
  //   loadComponent: () => import('./pages/not-found/not-found').then(m => m.NotFound),
  // },
];
