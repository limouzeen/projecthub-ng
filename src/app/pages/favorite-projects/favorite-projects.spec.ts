import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FavoriteProjects } from './favorite-projects';

describe('FavoriteProjects', () => {
  let component: FavoriteProjects;
  let fixture: ComponentFixture<FavoriteProjects>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FavoriteProjects]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FavoriteProjects);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
