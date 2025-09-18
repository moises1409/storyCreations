import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-add-credits-modal',
  imports: [CommonModule],
  template: `
<div class="modal-root" (click)="close()">
  <div class="modal-card" (click)="$event.stopPropagation()">
  <h2 class="modal-title">Upgrade your plan</h2>
  <p class="modal-sub">Choose a credit pack to continue creating stories.</p>
  <div class="plans">
    <div class="plan">
      <div class="plan-title">Starter</div>
      <div class="plan-credits">50 credits</div>
      <div class="plan-price">10 CHF</div>
      <button class="dashboard-btn" (click)="select('starter')">Add credits</button>
    </div>
    <div class="plan featured">
      <div class="plan-title">Pro</div>
      <div class="plan-credits">100 credits</div>
      <div class="plan-price">17 CHF</div>
      <button class="dashboard-btn" (click)="select('pro')">Add credits</button>
    </div>
    <div class="plan">
      <div class="plan-title">Max</div>
      <div class="plan-credits">150 credits</div>
      <div class="plan-price">25 CHF</div>
      <button class="dashboard-btn" (click)="select('max')">Add credits</button>
    </div>
  </div>
  <div class="modal-actions"><button class="small" (click)="close()">Close</button></div>
</div>
</div>
`,
  styles: [`
.modal-root { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(2px); z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
.modal-card { background: var(--medium-gray); border: 1px solid var(--light-gray); border-radius: 16px; padding: 1.25rem; width: min(820px, 92vw); color: var(--white); box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
.modal-title { margin: 0 0 0.25rem 0; font-size: 1.6rem; font-weight: 800; background: linear-gradient(45deg, var(--white), var(--primary-green)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.modal-sub { margin: 0 0 0.75rem 0; color: var(--text-gray); }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.plan { background: var(--dark-gray); border: 1px solid var(--light-gray); border-radius: 12px; padding: 1rem; text-align: left; transition: border-color .2s ease, transform .2s ease; }
.plan:hover { border-color: var(--primary-green); transform: translateY(-2px); }
.plan .plan-title { color: var(--white); font-weight: 800; font-size: 1.1rem; margin-bottom: 0.35rem; }
.plan .plan-credits { color: var(--white); font-size: 0.95rem; margin-bottom: 0.35rem; }
.plan .plan-price { color: var(--white); font-weight: 800; font-size: 1.1rem; margin-bottom: 0.6rem; }
.plan.featured { border-color: var(--primary-green); box-shadow: 0 10px 30px rgba(0,255,136,0.2); }
.modal-actions { margin-top: 1rem; display: flex; justify-content: flex-end; }

/* Buttons (scoped copy to ensure styling inside modal) */
.dashboard-btn { background: linear-gradient(45deg, var(--primary-green), var(--secondary-green)); border:none; padding:0.7rem 1.1rem; border-radius: 24px; color: var(--black); font-weight: 800; cursor:pointer; box-shadow: 0 10px 30px rgba(0,255,136,0.3); }
.dashboard-btn:hover { transform: translateY(-2px); box-shadow: 0 15px 40px rgba(0,255,136,0.4); }
.small { background: transparent; color: var(--white); border:1px solid var(--light-gray); border-radius: 10px; padding: 0.45rem 0.75rem; cursor:pointer; }
.small:hover { border-color: var(--primary-green); }
@media (max-width: 720px) { .plans { grid-template-columns: 1fr; } }
`]
})
export class AddCreditsModalComponent {
  @Output() closeModal = new EventEmitter<void>();
  @Output() choosePlan = new EventEmitter<'starter' | 'pro' | 'max'>();

  close() { this.closeModal.emit(); }
  select(plan: 'starter'|'pro'|'max') { this.choosePlan.emit(plan); }
}


