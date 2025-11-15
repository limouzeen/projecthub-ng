import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FooterStateService } from '../../core/footer-state.service';

@Component({
  selector: 'app-guide',
  imports: [],
  templateUrl: './guide.html',
  styleUrl: './guide.css',
})
export class Guide {
       //  constructor
  constructor(
    private footer: FooterStateService,private location: Location
  ) {}
   //  ตั้ง threshold เฉพาะหน้า Login: ย่อเมื่อสูง < 719px
  ngOnInit(): void {
    this.footer.setThreshold(800);
    this.footer.setForceCompact(null); // ให้ทำงานแบบ auto ตาม threshold
  }

  // ออกจากหน้านี้ให้คืนค่ากลับปกติ
  ngOnDestroy(): void {
    this.footer.resetAll();
  }


  goBack() {
    this.location.back();
  }
  
}