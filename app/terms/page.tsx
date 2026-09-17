import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — RecoverAI",
  description:
    "Terms for using RecoverAI abandoned-cart recovery calling.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service">
      <p>Last updated: 9 September 2026</p>
      <p>
        These terms govern access to RecoverAI, including the marketing site,
        merchant dashboard, Shopify connection, and voice recovery calls. By
        creating an account or connecting a store you agree to them.
      </p>

      <h2>The service</h2>
      <p>
        RecoverAI helps merchants call shoppers who left an unpaid checkout.
        We sync abandoned checkouts (Shopify Admin API, webhook, or a Google
        Sheet the merchant provides), schedule calls inside a calling window,
        place SIP calls through Tough Tongue AI, and show call status in the
        dashboard. We do not guarantee that any shopper will answer, complete
        a purchase, or that recovered revenue will exceed calling cost.
      </p>

      <h2>Accounts and stores</h2>
      <ul>
        <li>You must provide accurate account information and keep credentials confidential.</li>
        <li>
          You may only connect Shopify stores you are authorized to operate.
          OAuth tokens and Admin API credentials are stored encrypted and used
          only to provide the service.
        </li>
        <li>
          You are responsible for team invites and for anyone you allow to
          place or stop calls on a store.
        </li>
      </ul>

      <h2>Calling, consent, and compliance</h2>
      <ul>
        <li>
          You represent that you have a lawful basis to call each phone number
          (including abandoned-checkout recovery) under applicable telemarketing,
          TCPA, TRAI, GDPR, and similar rules in every country you dial.
        </li>
        <li>
          You configure calling windows, concurrency, delays, and whether
          auto-call is on. You must not use RecoverAI to harass shoppers or to
          dial numbers you are not allowed to contact.
        </li>
        <li>
          Calls may be recorded and transcribed by our telephony provider so
          the dashboard can show outcomes. You are responsible for any
          recording notice required in your jurisdictions.
        </li>
      </ul>

      <h2>Billing</h2>
      <p>
        Voice usage is billed in minutes against your RecoverAI balance.
        Top-ups are processed by Dodo Payments. Minutes are consumed when a
        call reaches a billable outcome. Unused promotional minutes may expire
        as stated at grant. Fees are generally non-refundable except where
        required by law.
      </p>

      <h2>Acceptable use</h2>
      <p>You may not reverse engineer the service, probe other merchants’ data, send malware, or use RecoverAI for anything other than legitimate cart-recovery or related merchant operations we enable (such as NDRC confirmation calls).</p>

      <h2>Shopify, TTAI, and other providers</h2>
      <p>
        Shopify, Clerk, Tough Tongue AI, Google, and Dodo Payments have their
        own terms. Outages or policy changes at those providers can affect
        RecoverAI. We are not those companies and are not responsible for their
        platforms except as required by law.
      </p>

      <h2>Intellectual property</h2>
      <p>
        RecoverAI, its dashboard, and related software remain our property.
        Checkout, product, and customer data remain the merchant’s (and
        Shopify’s) as applicable. You grant us a limited license to process
        that data solely to provide the service.
      </p>

      <h2>Disclaimer and liability</h2>
      <p>
        The service is provided “as is.” We disclaim implied warranties of
        merchantability, fitness for a particular purpose, and non-infringement
        to the fullest extent permitted by law. To the fullest extent permitted
        by law, RecoverAI’s aggregate liability for claims relating to the
        service is limited to the amounts you paid us for RecoverAI in the
        three months before the claim.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using RecoverAI and disconnect stores at any time. We may
        suspend or terminate access for non-payment, abuse, or legal risk.
        Provisions that should survive (billing, liability, IP) survive
        termination.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. Continued use after we post a change
        constitutes acceptance. If you do not agree, disconnect your stores
        and stop using the service.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: use the contact method on your RecoverAI
        account or contract.
      </p>
    </LegalPage>
  );
}
