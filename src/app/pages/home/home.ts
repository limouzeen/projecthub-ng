import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterStateService } from '../../core/footer-state.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit, OnDestroy {


      //  constructor
  constructor(
    private footer: FooterStateService
  ) {}
   //  ตั้ง threshold เฉพาะหน้า Login: ย่อเมื่อสูง < 600px
  ngOnInit(): void {
    this.footer.setThreshold(600);
    this.footer.setForceCompact(null); // ให้ทำงานแบบ auto ตาม threshold
  }

  // ออกจากหน้านี้ให้คืนค่ากลับปกติ
  ngOnDestroy(): void {
    this.footer.resetAll();
  }
}
