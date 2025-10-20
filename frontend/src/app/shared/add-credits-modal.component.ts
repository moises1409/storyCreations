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
.modal-root { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 2147483647; display: flex; align-items: center; justify-content: center; }
.modal-card { background: var(--background-light); border: 2px solid var(--border-light); border-radius: 20px; padding: 1.25rem; width: min(820px, 92vw); color: var(--text-dark); box-shadow: 0 20px 60px var(--shadow-medium); }
.modal-title { margin: 0 0 0.25rem 0; font-size: 1.6rem; font-weight: 800; background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow), var(--primary-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-family: 'Fredoka', sans-serif; }
.modal-sub { margin: 0 0 0.75rem 0; color: var(--text-medium); font-family: 'Fredoka', sans-serif; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
.plan { background: var(--background-light); border: 2px solid var(--border-light); border-radius: 16px; padding: 1rem; text-align: left; transition: all 0.3s ease; box-shadow: 0 4px 12px var(--shadow-light); }
.plan:hover { border-color: var(--primary-pink); transform: translateY(-2px); box-shadow: 0 8px 20px var(--shadow-medium); }
.plan .plan-title { color: var(--text-dark); font-weight: 800; font-size: 1.1rem; margin-bottom: 0.35rem; font-family: 'Fredoka', sans-serif; }
.plan .plan-credits { color: var(--text-medium); font-size: 0.95rem; margin-bottom: 0.35rem; font-family: 'Fredoka', sans-serif; }
.plan .plan-price { color: var(--text-dark); font-weight: 800; font-size: 1.1rem; margin-bottom: 0.6rem; font-family: 'Fredoka', sans-serif; }
.plan.featured { border-color: var(--primary-pink); box-shadow: 0 8px 20px rgba(255, 111, 145, 0.3); background: linear-gradient(135deg, var(--background-light) 0%, rgba(255, 111, 145, 0.05) 100%); }
.modal-actions { margin-top: 1rem; display: flex; justify-content: flex-end; }

/* Buttons (scoped copy to ensure styling inside modal) */
.dashboard-btn { background: linear-gradient(45deg, var(--primary-pink), var(--primary-yellow)); border:none; padding:0.7rem 1.1rem; border-radius: 30px; color: var(--text-white); font-weight: 800; cursor:pointer; box-shadow: 0 8px 20px rgba(255, 111, 145, 0.3); font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
.dashboard-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(255, 111, 145, 0.4); }
.small { background: transparent; color: var(--text-dark); border:2px solid var(--border-light); border-radius: 12px; padding: 0.45rem 0.75rem; cursor:pointer; font-family: 'Fredoka', sans-serif; transition: all 0.3s ease; }
.small:hover { border-color: var(--primary-pink); background: rgba(255, 111, 145, 0.1); }
@media (max-width: 720px) { .plans { grid-template-columns: 1fr; } }
`]
})
export class AddCreditsModalComponent {
  @Output() closeModal = new EventEmitter<void>();
  @Output() choosePlan = new EventEmitter<'starter' | 'pro' | 'max'>();

  close() { this.closeModal.emit(); }
  select(plan: 'starter'|'pro'|'max') { this.choosePlan.emit(plan); }
}


