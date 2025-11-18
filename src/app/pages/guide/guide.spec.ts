import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Guide } from './guide';
import { FooterStateService } from '../../core/footer-state.service';
import { Location } from '@angular/common';
import { By } from '@angular/platform-browser';

describe('Guide', () => {
  let component: Guide;
  let fixture: ComponentFixture<Guide>;

  let footerSpy: jasmine.SpyObj<FooterStateService>;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    // สร้าง spy สำหรับ service ทั้งสองตัว
    footerSpy = jasmine.createSpyObj('FooterStateService', [
      'setThreshold',
      'setForceCompact',
      'resetAll',
    ]);

    locationSpy = jasmine.createSpyObj('Location', ['back']);

    await TestBed.configureTestingModule({
      imports: [Guide], // เพราะ Guide เป็น standalone component
      providers: [
        { provide: FooterStateService, useValue: footerSpy },
        { provide: Location, useValue: locationSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Guide);
    component = fixture.componentInstance;

    // เรียก ngOnInit + render template
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set footer threshold on init', () => {
    // เมื่อ detectChanges แล้ว ngOnInit ถูกเรียกไปแล้ว
    expect(footerSpy.setThreshold).toHaveBeenCalledWith(800);
    expect(footerSpy.setForceCompact).toHaveBeenCalledWith(null);
  });

  it('should reset footer on destroy', () => {
    // ทำลาย component → ควรเรียก resetAll
    fixture.destroy();
    expect(footerSpy.resetAll).toHaveBeenCalled();
  });

  it('should go back when back button is clicked', () => {
    // หา element ปุ่ม back จาก template
    const backButton = fixture.debugElement.query(
      By.css('a[aria-label="Back"]')
    );

    // จำลองการคลิก
    backButton.triggerEventHandler('click', new Event('click'));

    // ควรเรียก location.back()
    expect(locationSpy.back).toHaveBeenCalled();
  });
});
