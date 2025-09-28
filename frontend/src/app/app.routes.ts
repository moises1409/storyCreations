import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { LandingComponent } from './landing/landing.component';
import { authGuard } from './auth/auth.guard';
import { StoryComponent } from './story/story.component';
import { CreationsComponent } from './creations/creations.component';
import { AccountComponent } from './account/account.component';
import { PrivacyComponent } from './privacy/privacy.component';
import { TermsComponent } from './terms/terms.component';
import { CharactersComponent } from './characters/characters.component';


export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'characters/new', component: CharactersComponent, canActivate: [authGuard] },
  { path: 'creations', component: CreationsComponent, canActivate: [authGuard] },
  { path: 'account', component: AccountComponent, canActivate: [authGuard] },
  { path: 'story/new', component: StoryComponent, canActivate: [authGuard] },
  { path: 'story/:id', component: StoryComponent, canActivate: [authGuard] },
  { path: 'privacy', component: PrivacyComponent },
  { path: 'terms', component: TermsComponent },
  { path: '**', redirectTo: '' }
];

