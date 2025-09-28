import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-terms',
  imports: [CommonModule, RouterModule],
  template: `
    <div class="terms-page">
      <a routerLink="/" class="back-link">← Back to Home</a>
      <h1>Terms of Service</h1>
      <p class="updated">Last updated: <span>{{ lastUpdated }}</span></p>

      <p>
        These Terms of Service ("Terms") govern your access to and use of
        linked-ideas.com (the "Website") and the services provided, including
        story ideation, chapter generation, voice narration playback, image
        generation, and related features (collectively, the "Services"). By
        using the Services, you agree to these Terms.
      </p>

      <h2>1. Accounts and Eligibility</h2>
      <ul>
        <li>You must be at least 13 years old or have verifiable parental consent.</li>
        <li>You are responsible for maintaining the confidentiality of your account and credentials.</li>
        <li>You agree that the information you provide is accurate and kept up to date.</li>
      </ul>

      <h2>2. Credits and Billing</h2>
      <ul>
        <li>The Services may require credits to generate content. Credits may be purchased in packs.</li>
        <li>Credit usage is consumed on generation events (e.g., seed, chapter, final chapter, images).</li>
        <li>Unless required by law, purchased credits are non-transferable and non-refundable.</li>
        <li>A history of credit additions is visible under Account → Billing.</li>
      </ul>

      <h2>3. Content and Ownership</h2>
      <ul>
        <li>You retain ownership of inputs you provide (prompts, text, images).</li>
        <li>You grant us a limited license to process your inputs to deliver the Services.</li>
        <li>Subject to third-party rights and these Terms, you may use generated outputs for personal or business purposes at your own risk.</li>
        <li>You are solely responsible for ensuring that your use of any generated content complies with applicable laws and third‑party rights (e.g., IP, publicity).</li>
      </ul>

      <h2>4. Acceptable Use</h2>
      <ul>
        <li>No illegal, harmful, hateful, exploitative, or infringing content.</li>
        <li>No attempts to reverse engineer or circumvent usage limits.</li>
        <li>No automated scraping or misuse that degrades the Services.</li>
      </ul>

      <h2>5. AI Limitations</h2>
      <p>
        Outputs may be imprecise, incomplete, or unsuitable. The Services are provided "as is"
        without guarantees of accuracy, reliability, or fitness for a particular purpose. You
        should review outputs before relying on them.
      </p>

      <h2>6. Privacy</h2>
      <p>
        Our processing of personal data is described in the Privacy Policy available on the Website.
        By using the Services, you acknowledge that you have read and understood that policy.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may delete your account at any time from the Account page. We may suspend or terminate
        access if you breach these Terms or use the Services in a way that creates risk or liability.
      </p>

      <h2>8. Changes to the Services or Terms</h2>
      <p>
        We may modify the Services or these Terms. Updates will be posted on this page. Continued use
        after changes become effective constitutes acceptance of the updated Terms.
      </p>

      <h2>9. Disclaimers; Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, we disclaim all warranties and limit liability for any
        indirect, incidental, or consequential damages arising out of or related to your use of the Services.
      </p>

      <h2>10. Contact</h2>
      <p>
        For questions about these Terms, contact <a [href]="'mailto:' + contactEmail">{{ contactEmail }}</a>.
      </p>
    </div>
  `,
  styles: [
    `
    .terms-page { position: relative; padding: 2rem; max-width: 900px; margin: 2rem auto; background: #ffffff; border: 2px solid #f0e6ff; border-radius: 20px; box-shadow: 0 10px 24px rgba(106, 90, 205, 0.08); }
    .terms-page::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; background: linear-gradient(90deg, #a8edea, #fed6e3, #ffd166); opacity: 0.8; border-top-left-radius: 20px; border-top-right-radius: 20px; }
    .back-link { display:inline-block; margin-bottom: 0.75rem; color: #6a5acd; text-decoration: none; font-weight: 700; }
    .back-link:hover { text-decoration: underline; color: #4f41cc; }
    h1 { font-size: 2rem; margin: 0 0 0.5rem 0; background: linear-gradient(45deg, #6a5acd, #ff6f91); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h2 { margin-top: 1.25rem; font-size: 1.25rem; color: #333333; }
    p, li { color: #555555; line-height: 1.7; }
    .updated { color: #666666; margin-bottom: 1rem; }
    ul { padding-left: 1.25rem; }
    `
  ]
})
export class TermsComponent {
  contactEmail = 'info@linked-ideas.com';
  lastUpdated = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
}


