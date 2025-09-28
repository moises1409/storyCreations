import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-privacy',
  imports: [CommonModule, RouterModule],
  template: `
    <div class="privacy-page">
      <a routerLink="/" class="back-link">← Back to Home</a>
      <h1>Privacy Policy</h1>
      <p class="updated">Last updated: <span>{{ lastUpdated }}</span></p>

      <p>
        Welcome to linked-ideas.com (the "Website"). This Privacy Policy explains how we
        collect, use, disclose, and protect the personal information of our users
        ("you" or "your") when you access and use the Website.
      </p>

      <p>
        By using the Website, you agree to the collection and use of information in
        accordance with this Privacy Policy.
      </p>

      <h2>Information We Collect</h2>
      <ol>
        <li>
          <strong>Personal Information:</strong> Information you provide when you
          register for an account or interact with the Website, such as your name
          and email address. Parents or guardians may also use the Website on behalf
          of a child; in such cases, we may collect the parent or guardian's name and
          email address.
        </li>
        <li>
          <strong>Usage Information:</strong> Information about your interactions
          with the Website (for example, pages visited and features used), which may
          include analytics data.
        </li>
        <li>
          <strong>Cookies:</strong> We use cookies to improve your experience and
          analyze traffic. You can control cookie usage through your browser
          settings.
        </li>
      </ol>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>Provide, operate, and improve the Website and our services.</li>
        <li>Personalize content and recommendations.</li>
        <li>Communicate with you about updates or relevant information.</li>
        <li>Maintain the security and integrity of the Website.</li>
      </ul>

      <h2>Sharing Your Information</h2>
      <p>
        We do not sell or share your personal information with third parties except
        as required by law, to provide the services you request, or with your
        consent.
      </p>

      <h2>Data Deletion</h2>
      <p>
        You can delete your account at any time from the Account page. Deletion
        takes effect immediately and removes your personal data, stories, and
        chapters from our production systems. We do not retain any identifying
        information or traces that could re‑identify you, unless we are legally
        required to do so. If you need assistance, please contact
        <a [href]="'mailto:' + contactEmail">{{ contactEmail }}</a>.
      </p>

      <h2>Children’s Privacy</h2>
      <p>
        We are committed to protecting children’s privacy. We do not knowingly
        collect personal information from children without appropriate consent from
        a parent or guardian. If you believe information has been collected in
        error, please contact us and we will take steps to remove it.
      </p>

      <h2>Changes to This Privacy Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Any changes will be
        posted on this page. Please review this Privacy Policy periodically for
        updates.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or our privacy practices,
        please contact us at <a [href]="'mailto:' + contactEmail">{{ contactEmail }}</a>
        or visit <a [href]="siteUrl" target="_blank" rel="noopener">{{ siteUrl }}</a>.
      </p>
    </div>
  `,
  styles: [
    `
    .privacy-page { position: relative; padding: 2rem; max-width: 900px; margin: 2rem auto; background: #ffffff; border: 2px solid #f0e6ff; border-radius: 20px; box-shadow: 0 10px 24px rgba(106, 90, 205, 0.08); }
    .privacy-page::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 6px; background: linear-gradient(90deg, #a8edea, #fed6e3, #ffd166); opacity: 0.8; border-top-left-radius: 20px; border-top-right-radius: 20px; }
    .back-link { display:inline-block; margin-bottom: 0.75rem; color: #6a5acd; text-decoration: none; font-weight: 700; }
    .back-link:hover { text-decoration: underline; color: #4f41cc; }
    h1 { font-size: 2rem; margin: 0 0 0.5rem 0; background: linear-gradient(45deg, #6a5acd, #ff6f91); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    h2 { margin-top: 1.25rem; font-size: 1.25rem; color: #333333; }
    p, li { color: #555555; line-height: 1.7; }
    .updated { color: #666666; margin-bottom: 1rem; }
    ol, ul { padding-left: 1.25rem; }
    `
  ]
})
export class PrivacyComponent {
  siteUrl = 'https://linked-ideas.com';
  contactEmail = 'info@linked-ideas.com';
  lastUpdated = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
}


