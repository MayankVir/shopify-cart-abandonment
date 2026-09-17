import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — RecoverAI",
  description:
    "How RecoverAI collects, uses, and shares data for abandoned-cart recovery calls.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>Last updated: 9 September 2026</p>
      <p>
        RecoverAI (“we”, “us”) provides merchants with automated and manual
        voice recovery calls for abandoned Shopify checkouts. This policy
        describes the information we process when you visit recoverai, create an
        account, connect a store, or place or receive a recovery call.
      </p>

      <h2>Who this applies to</h2>
      <ul>
        <li>
          <strong className="text-gray-200">Merchants and team members</strong> who
          sign in, connect Shopify stores, and use the dashboard.
        </li>
        <li>
          <strong className="text-gray-200">Shoppers</strong> whose checkout,
          phone number, and call recordings are processed so a merchant can
          attempt cart recovery. Shoppers’ relationship is with the merchant;
          we process that data as a service provider on the merchant’s
          instructions.
        </li>
      </ul>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong className="text-gray-200">Account data.</strong> Name, email,
          and authentication identifiers from Clerk when you sign in or join a
          store.
        </li>
        <li>
          <strong className="text-gray-200">Store and checkout data.</strong>{" "}
          Shopify shop domain, timezone, abandoned checkout tokens, cart
          contents, amounts, emails, phone numbers, shipping addresses, and
          draft-order identifiers, received via Shopify Admin API, webhooks, or
          a merchant-provided Google Sheet.
        </li>
        <li>
          <strong className="text-gray-200">Call data.</strong> Dial attempts,
          status, duration, transcripts, AI summaries, tool-call payloads, and
          pipeline timing logs. Voice traffic is placed through Tough Tongue AI
          (TTAI) using the merchant’s SIP scenario and trunk.
        </li>
        <li>
          <strong className="text-gray-200">Billing data.</strong> Minute
          balance, top-ups, and payment metadata processed by Dodo Payments.
          We store usage events so we can debit minutes after a call.
        </li>
        <li>
          <strong className="text-gray-200">Technical data.</strong> Server
          logs, webhook identifiers, and approximate request metadata needed
          to operate and debug the service.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Authenticate users and enforce store access.</li>
        <li>
          Schedule and place recovery calls inside the merchant’s calling
          window, including retries after certain failures.
        </li>
        <li>
          Rebuild carts or draft orders so the voice agent can complete a sale
          when the shopper agrees.
        </li>
        <li>Show call history, transcripts, and dispatch timelines in the dashboard.</li>
        <li>Meter voice minutes and process payments.</li>
        <li>Secure the product, prevent abuse, and comply with law.</li>
      </ul>

      <h2>Sharing</h2>
      <p>We share data with processors who help us run RecoverAI:</p>
      <ul>
        <li>Clerk — authentication.</li>
        <li>Shopify — store, checkout, customer, and order APIs the merchant authorizes.</li>
        <li>Tough Tongue AI — SIP origination, call recording, and transcripts.</li>
        <li>Dodo Payments — card and wallet checkout for minute top-ups.</li>
        <li>
          Infrastructure hosts (for example the database and application host)
          that store encrypted credentials and operational data.
        </li>
        <li>
          Google Sheets, only when the merchant enables sheet sync or call
          feedback write-back.
        </li>
      </ul>
      <p>
        We do not sell personal information. We may disclose information if
        required by law or to protect RecoverAI, merchants, or shoppers from
        fraud or harm.
      </p>

      <h2 id="cookies">Cookies</h2>
      <p>
        We use strictly necessary cookies and similar storage for sign-in
        (Clerk), session security, and remembering dashboard preferences such
        as theme. We do not run third-party advertising cookies on the
        marketing site. You can block non-essential cookies in your browser;
        authentication cookies are required to use the dashboard.
      </p>

      <h2>Retention</h2>
      <p>
        We keep account, store, checkout, call attempt, transcript, and billing
        records for as long as the merchant account is active and as needed
        for metering, dispute, and legal obligations. Merchants may ask us to
        delete a store connection; some billing records are retained where we
        must keep them.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Merchants can disconnect a store, disable auto-call, or stop a scheduled call.</li>
        <li>Team members can leave a store they were invited to.</li>
        <li>
          Shoppers should contact the merchant for access or deletion of
          checkout and call data. We will assist the merchant where we hold
          that data.
        </li>
      </ul>

      <h2>International transfers</h2>
      <p>
        RecoverAI and its processors may process data in countries other than
        yours, including where Shopify, Clerk, TTAI, or our hosts operate.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy requests, contact the merchant who called you, or email
        the RecoverAI operator listed on your RecoverAI account or contract.
      </p>
    </LegalPage>
  );
}
