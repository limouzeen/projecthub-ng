import { Injectable /*, Optional */ } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
// import { HttpClient } from '@angular/common/http';

export interface FavoriteProject {
  projectId: number;
  name: string;
  lastUpdated: string;   // ISO string

  tables: number;        // จำนวน table เหมือนหน้า dashboard
  isPinned: boolean;     // ใช้แทน favorite
}

@Injectable({ providedIn: 'root' })
export class FavoriteProjectsService {
  // --- ของจริง: ไว้รอผูก API ---
  // constructor(@Optional() private http: HttpClient) {}
  //
  // getFavorites(): Observable<FavoriteProject[]> {
  //   return this.http.get<FavoriteProject[]>('/api/projects/favorites');
  // }

  // --- MOCK ปัจจุบัน ---
  getFavorites(): Observable<FavoriteProject[]> {
    const mock: FavoriteProject[] = [
      {
        projectId: 101,
        name: 'Sales Analytics',   
        lastUpdated: '2025-11-08T09:15:00Z',
        tables: 8,
        isPinned: true,
      },
      {
        projectId: 102,
        name: 'Marketing Campaign 2025',
        lastUpdated: '2025-11-07T07:40:00Z',
        tables: 15,
        isPinned: true,
      },
      {
        projectId: 103,
        name: 'Inventory Management',  
        lastUpdated: '2025-11-05T12:00:00Z',
        tables: 6,
        isPinned: true,
      },
      {
        projectId: 104,
        name: 'Inventory Management',      
        lastUpdated: '2025-11-05T12:00:00Z',
        tables: 6,
        isPinned: true,
      },
      {
        projectId: 105,
        name: 'Inventory Management',   
        lastUpdated: '2025-11-05T12:00:00Z',
        tables: 6,
        isPinned: true,
      },
      {
        projectId: 106,
        name: 'Inventory Management',      
        lastUpdated: '2025-11-05T12:00:00Z',
        tables: 6,
        isPinned: true,
      },
      {
        projectId: 107,
        name: 'Inventory Management',      
        lastUpdated: '2025-11-05T12:00:00Z',
        tables: 6,
        isPinned: true,
      },
      {
        projectId: 108,
        name: 'Inventory Management',  
        lastUpdated: '2025-11-05T12:00:00Z',
        tables: 6,
        isPinned: true,
      },
    ];
    return of(mock).pipe(delay(160));
  }
}
