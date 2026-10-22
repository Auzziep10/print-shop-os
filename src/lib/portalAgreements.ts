export interface PortalAgreementPage {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  content: string;
}

export interface SignedAgreementPageRecord {
  id: string;
  title: string;
  subtitle: string;
  contentSnapshot: string;
  initials: string;
  initialedAt: string;
}

export interface PortalAgreementsSignedData {
  signedAt: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  companyName: string;
  initials: string;
  signatureType: 'type' | 'draw';
  signatureText?: string;
  signatureDataUrl?: string;
  signedPages: SignedAgreementPageRecord[];
  userAgent?: string;
}

export const DEFAULT_PORTAL_AGREEMENTS: PortalAgreementPage[] = [
  {
    id: 'nda',
    title: 'Mutual Non-Disclosure Agreement (NDA)',
    subtitle: 'Document 1 of 4 • Confidentiality & Proprietary Information',
    enabled: true,
    content: `MUTUAL NON-DISCLOSURE & CONFIDENTIALITY AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of {{DATE}} ("Effective Date") by and between INKTHEORY / WOVN ("Provider") and {{COMPANY_NAME}} ("Client").

1. PURPOSE OF CONFIDENTIALITY
In connection with Client's access to the Client Portal, custom garment catalogs, private pricing structures, design decks, mockups, and manufacturing workflows (collectively, the "Services"), each party may disclose certain confidential and proprietary information ("Confidential Information") to the other party.

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" includes, without limitation:
(a) All custom garment pricing tiers, wholesale pricing, account discounts, and quote structures displayed within the Client Portal;
(b) Unpublished apparel designs, tech packs, digital mockups, colorways, artwork files, and seasonal product decks;
(c) Proprietary production methods, sourcing partners, fulfillment workflows, and portal software features; and
(d) Any business, financial, or customer roster information shared between the parties.

3. OBLIGATIONS OF RECEIVING PARTY
Each party agrees to:
(a) Hold the other party's Confidential Information in strict confidence and exercise at least the same degree of care as it uses to protect its own confidential information (and no less than reasonable care);
(b) Not disclose any Confidential Information, including portal screenshots, pricing sheets, or custom design decks, to any third party, competitor, or unauthorized person without prior written consent; and
(c) Use Confidential Information solely for evaluating, ordering, and managing custom merchandise and fulfillment services between Provider and Client.

4. INTELLECTUAL PROPERTY & DESIGN OWNERSHIP
Access to the Client Portal and any custom design decks or mockups prepared by Provider remains subject to the parties' commercial terms. Pre-existing intellectual property, logos, and trademarks of each party remain the sole property of that party.

5. TERM
The obligations under this Agreement shall remain in full force and effect throughout the duration of Client's access to the Client Portal and for a period of three (3) years following the last disclosure of Confidential Information.`
  },
  {
    id: 'production_terms',
    title: 'Master Portal & Production Terms',
    subtitle: 'Document 2 of 4 • Order Approvals, Tolerances & Fulfillment',
    enabled: true,
    content: `MASTER CLIENT PORTAL & PRODUCTION TERMS OF SERVICE

This Master Portal & Production Terms Agreement ("Terms") governs all quotes, sample requests, and production orders placed by {{COMPANY_NAME}} ("Client") through the Client Portal as of {{DATE}}.

1. MOCKUP & PROOF APPROVALS
All digital mockups, artwork placements, garment styles, colorways, and size breakdowns approved or submitted through the Client Portal constitute final production authorization. Client is responsible for verifying spelling, color selections, and quantities prior to order submission.

2. PRODUCTION TOLERANCES & VARIATIONS
Custom apparel decoration (including screen printing, DTF, embroidery, and specialty finishing) is subject to standard industry tolerances:
(a) Graphic placement tolerance of up to 0.5 inches from digital mockup representation;
(b) Garment dye lots and screen-viewed digital colors may vary slightly from physical fabric swatches and Pantone references; and
(c) Industry-standard over/under-run allowance of up to 2–3% per size/style on bulk production runs.

3. TURNAROUND TIMES & SHIPPING
Estimated ship dates and production timelines begin only after:
(a) Final order approval in the Client Portal;
(b) Receipt of required payment or approved terms authorization; and
(c) Arrival of all blank garments from mill/distributor warehouses.
Provider is not liable for carrier transit delays, weather disruptions, or mill stock backorders beyond its reasonable control.

4. CANCELLATIONS & CHANGE ORDERS
Once an order has entered garment procurement or production status, cancellations or size/artwork revisions may incur restocking fees, screen/setup charges, or full cost recovery for garments already decorated.`
  },
  {
    id: 'payment_terms',
    title: 'Payment, Billing & Terms Authorization',
    subtitle: 'Document 3 of 4 • Invoicing, Deposits & Payment Policies',
    enabled: true,
    content: `PAYMENT, BILLING & ACCOUNT TERMS AGREEMENT

This Payment & Billing Authorization ("Payment Agreement") sets forth the financial terms governing orders placed by {{COMPANY_NAME}} ("Client") effective {{DATE}}.

1. PRICING & TAXES
All prices displayed in the Client Portal are exclusive of applicable state and local sales taxes, shipping, and handling unless explicitly marked otherwise (such as an approved Tax Exempt Resale Certificate on file or Free Shipping account status).

2. PAYMENT TERMS & NET TERMS ELIGIBILITY
(a) Standard Orders: Unless Net 30 Terms have been explicitly enabled on Client's account profile, payment is due upon order placement or invoice receipt prior to shipment.
(b) Net 30 Accounts: Where Net 30 Terms are approved for Client, full payment is due within thirty (30) calendar days of the invoice date.
(c) Credit Card Processing: Invoices paid via credit card may be subject to the processing fee specified on the applicable invoice.

3. LATE PAYMENTS & ACCOUNT HOLDS
Invoices remaining unpaid past their due date may be subject to a late finance charge of 1.5% per month (or the maximum rate permitted by law) and temporary suspension of Net Terms or shipment holds on pending orders until the account balance is brought current.

4. CLAIMS & RETURNS
Because all garments are custom-decorated to Client's specifications, custom merchandise is non-refundable except in cases of verified manufacturing defects or order fulfillment errors reported in writing within seven (7) business days of delivery.`
  },
  {
    id: 'brand_release',
    title: 'Artwork, Brand Assets & Portal Authorization',
    subtitle: 'Document 4 of 4 • Intellectual Property & Authorized Users',
    enabled: true,
    content: `ARTWORK, BRAND ASSETS & PORTAL AUTHORIZATION AGREEMENT

This Artwork & Portal Authorization Agreement ("Authorization") is entered into by {{COMPANY_NAME}} ("Client") as of {{DATE}}.

1. AUTHORIZATION TO REPRODUCE ARTWORK & LOGOS
Client represents and warrants that it owns or holds all necessary rights, licenses, and permissions to use all logos, trademarks, graphics, fonts, and brand assets uploaded to the Asset Vault or requested for production by Client. Client grants Provider a non-exclusive license to reproduce such assets solely for the purpose of creating mockups, samples, and custom merchandise ordered by Client.

2. INTELLECTUAL PROPERTY INDEMNIFICATION
Client agrees to indemnify and hold harmless Provider from and against any third-party claims, damages, or liabilities arising out of any alleged infringement of copyright, trademark, or publicity rights resulting from artwork or designs supplied by Client.

3. PORTAL SECURITY & AUTHORIZED CONTACTS
Client is responsible for maintaining the confidentiality of its Client Portal login credentials and QR access links. Any orders, quote approvals, roster updates, or asset uploads performed by users linked to Client's portal account shall be deemed authorized by Client.

4. ELECTRONIC SIGNATURES
Client agrees that electronic initials and signatures executed within this onboarding flow carry the same full legal weight, validity, and enforceability as original ink signatures.`
  }
];

export function resolvePortalAgreements(
  customPages?: PortalAgreementPage[] | null,
  companyName?: string
): PortalAgreementPage[] {
  const basePages = Array.isArray(customPages) && customPages.length > 0
    ? customPages
    : DEFAULT_PORTAL_AGREEMENTS;

  const formattedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const resolvedCompany = (companyName || 'Client').trim();

  return basePages.map((page, idx) => {
    const fallback = DEFAULT_PORTAL_AGREEMENTS[idx] || DEFAULT_PORTAL_AGREEMENTS[0];
    const rawContent = page.content || fallback.content;
    const populatedContent = rawContent
      .replace(/\{\{COMPANY_NAME\}\}/g, resolvedCompany)
      .replace(/\{\{DATE\}\}/g, formattedDate);

    return {
      id: page.id || fallback.id || `doc_${idx + 1}`,
      title: page.title || fallback.title || `Agreement Page ${idx + 1}`,
      subtitle: page.subtitle || fallback.subtitle || `Document ${idx + 1}`,
      enabled: page.enabled ?? true,
      content: populatedContent
    };
  });
}
