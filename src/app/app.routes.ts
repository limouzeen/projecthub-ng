import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';

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
  {
  path: 'favorites',
  loadComponent: () =>
    import('./pages/favorite-projects/favorite-projects').then(m => m.FavoriteProjects),
},
{ path: 'guide', loadComponent: () => import('./pages/guide/guide').then(m => m.Guide) },

  { path: 'about', loadComponent: () => import('./pages/about/about').then(m => m.About) },
  {
    path: 'profile/edit',
    loadComponent: () => import('./pages/edit-profile/edit-profile').then((m) => m.EditProfile),
  },
  {
  path: 'projects/:projectId',
  loadComponent: () =>
    import('./pages/project-detail/project-detail').then(m => m.ProjectDetail),
},


{ path: 'table/:id', loadComponent: () => import('./pages/table-view/table-view').then(m => m.TableView) },
{ path: 'recently-used', loadComponent: () => import('./pages/recently-used/recently-used').then(m => m.RecentlyUsedProjects) },

{
    path: 'admin/users',
    canMatch: [adminGuard],
    loadComponent: () =>
      import('./pages/admin-users/admin-users').then((m) => m.AdminUsers),
  },

  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/auth/forgot-password/forgot-password').then(
        (m) => m.ForgotPassword
      ),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./pages/auth/reset-password/reset-password').then(
        (m) => m.ResetPassword
      ),
  },


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
