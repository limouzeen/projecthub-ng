import { ComponentFixture, TestBed } from '@angular/core/testing';
import { About } from './about';
import { FooterStateService } from '../../core/footer-state.service';
import { Location } from '@angular/common';
import { provideRouter } from '@angular/router';

describe('About', () => {
  let component: About;
  let fixture: ComponentFixture<About>;

  let footerSpy: jasmine.SpyObj<FooterStateService>;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    footerSpy = jasmine.createSpyObj('FooterStateService', [
      'setThreshold',
      'setForceCompact',
      'resetAll',
    ]);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    await TestBed.configureTestingModule({
      imports: [About],              // เพราะ About เป็น standalone
      providers: [
        provideRouter([]),           //  ให้ router providers (รวม ActivatedRoute)
        { provide: FooterStateService, useValue: footerSpy },
        { provide: Location, useValue: locationSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(About);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
