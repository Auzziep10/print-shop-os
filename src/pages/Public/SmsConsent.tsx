import { useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, CheckCircle2, ShieldCheck, FileText, Smartphone, ArrowRight } from 'lucide-react';

export function SmsConsent() {
  const [activeTab, setActiveTab] = useState<'form' | 'privacy' | 'terms'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [consented, setConsented] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPhoneNumber = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!consented) {
      setError('You must agree to the SMS terms and check the consent box.');
      return;
    }

    const cleanPhone = phone.replace(/[^\d]/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'sms_consents'), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        company: company.trim() || 'Individual',
        consentGiven: true,
        consentedAt: serverTimestamp(),
        userAgent: navigator.userAgent,
        sourceUrl: window.location.href,
        optInMethod: 'Website Consent Form'
      });
      
      setIsSuccess(true);
    } catch (err: any) {
      console.error('Error recording SMS consent:', err);
      setError('An error occurred. Please try again or contact support.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl w-full space-y-8">
        
        {/* Branding & Logo */}
        <div className="flex flex-col items-center">
          <img src="/wovn-production-logo.png" alt="WOVN" className="h-12 w-auto mb-2 opacity-90" />
          <h2 className="text-3xl font-serif tracking-tight text-brand-primary text-center">
            SMS Consent & Notifications
          </h2>
          <p className="mt-2 text-sm text-brand-secondary text-center max-w-md">
            Stay updated with real-time text message alerts, confirmations, and reminders for your print projects.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-brand-border justify-center gap-1.5 sm:gap-4">
          <button
            onClick={() => setActiveTab('form')}
            className={`pb-3 text-xs sm:text-sm font-medium border-b-2 px-3 transition-colors ${
              activeTab === 'form'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-secondary hover:text-brand-primary'
            }`}
          >
            Consent Form
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`pb-3 text-xs sm:text-sm font-medium border-b-2 px-3 transition-colors ${
              activeTab === 'privacy'
                ? 'border-transparent text-brand-secondary hover:text-brand-primary'
                : 'border-brand-primary text-brand-primary'
            } ${activeTab === 'privacy' ? 'border-brand-primary text-brand-primary' : ''}`}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`pb-3 text-xs sm:text-sm font-medium border-b-2 px-3 transition-colors ${
              activeTab === 'terms'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-secondary hover:text-brand-primary'
            }`}
          >
            Terms of Service
          </button>
        </div>

        {/* Main Card Container */}
        <div className="bg-white border border-brand-border rounded-card shadow-sm p-6 sm:p-10 animate-in fade-in duration-300">
          
          {/* Tab 1: Opt-In Form */}
          {activeTab === 'form' && (
            <div>
              {isSuccess ? (
                <div className="text-center py-8 space-y-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mb-2">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-xl font-serif text-brand-primary">Consent Recorded Successfully</h3>
                  <p className="text-sm text-brand-secondary max-w-md mx-auto leading-relaxed">
                    Thank you! Your preferences have been updated. You will now receive automated updates and reminders about your print projects.
                  </p>
                  <p className="text-xs text-brand-secondary/60">
                    You can reply <strong>STOP</strong> at any time to opt-out, or <strong>HELP</strong> for assistance.
                  </p>
                  <div className="pt-6">
                    <button
                      onClick={() => {
                        setIsSuccess(false);
                        setName('');
                        setEmail('');
                        setPhone('');
                        setCompany('');
                        setConsented(false);
                      }}
                      className="px-4 py-2 border border-brand-border hover:border-brand-primary text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors bg-brand-bg text-brand-primary"
                    >
                      Submit Another
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 font-medium">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Austin Patterson"
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="e.g. WOVN Apparel"
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. email@example.com"
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-brand-secondary mb-2">
                        Mobile Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={handlePhoneChange}
                        placeholder="(555) 000-0000"
                        className="w-full bg-brand-bg/50 border border-brand-border rounded-lg px-4 py-3 text-sm focus:border-brand-primary focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {/* Compliance Opt-In Checkbox */}
                  <div className="pt-4 border-t border-brand-border">
                    <label className="flex items-start gap-3 cursor-pointer group select-none">
                      <input
                        type="checkbox"
                        checked={consented}
                        onChange={(e) => setConsented(e.target.checked)}
                        className="mt-1 h-4.5 w-4.5 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer shrink-0"
                      />
                      <span className="text-[11px] leading-relaxed text-brand-secondary group-hover:text-brand-primary transition-colors">
                        By checking this box, you agree to receive recurring automated promotional and transactional text messages (such as order status updates, delivery alerts, custom reminders, and design proofs) from WOVN at the mobile number provided above. Consent is not a condition of purchase or using our services. Msg & data rates may apply. Message frequency varies. Reply <strong>STOP</strong> to unsubscribe or <strong>HELP</strong> for assistance. You also agree to our{' '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('privacy')}
                          className="underline hover:text-brand-primary font-semibold focus:outline-none"
                        >
                          Privacy Policy
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('terms')}
                          className="underline hover:text-brand-primary font-semibold focus:outline-none"
                        >
                          Terms of Service
                        </button>.
                      </span>
                    </label>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-4 bg-brand-primary text-white text-center text-xs font-bold tracking-widest uppercase rounded-lg hover:bg-neutral-800 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="animate-spin" size={16} /> Recording Preferences...
                        </>
                      ) : (
                        <>
                          Confirm Consent <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Tab 2: Privacy Policy */}
          {activeTab === 'privacy' && (
            <div className="space-y-6 text-sm text-brand-secondary leading-relaxed font-sans">
              <div className="flex items-center gap-2 pb-2 border-b border-brand-border">
                <ShieldCheck className="text-brand-primary" size={20} />
                <h3 className="text-lg font-serif text-brand-primary">SMS Privacy Policy</h3>
              </div>
              
              <div className="space-y-4 text-xs">
                <p>
                  At WOVN, we value your trust and are committed to protecting your personal information. This SMS Privacy Policy details how we handle the information collected through our text messaging program.
                </p>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">Information We Collect</h4>
                  <p>
                    We collect your mobile phone number, name, and email address when you opt-in to receive messages from us. We also log your consent preferences, submission timestamps, and message history (exchanged with our platform).
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">How We Use Your Information</h4>
                  <p>
                    We use your mobile number to send automated or manually-triggered alerts related to your print jobs (e.g. order confirmations, proof approvals, shipping notifications, and reminders).
                  </p>
                </div>

                {/* CRITICAL A2P 10DLC COMPLIANT STATEMENT */}
                <div className="p-4 bg-brand-bg border border-brand-border rounded-xl">
                  <h4 className="font-bold text-brand-primary uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5">
                    <Smartphone size={14} /> SMS Data Sharing Disclosure (Carrier Compliance)
                  </h4>
                  <p className="font-medium text-brand-primary">
                    Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared or sold to any third parties or affiliates for any reason.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">Security of Your Data</h4>
                  <p>
                    Your contact information is securely stored within our private database and access is strictly limited to authorized personnel handling your print projects.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">Contact Us</h4>
                  <p>
                    If you have questions about this policy or your data, you can email us at support@wovn.com or reply HELP to any of our messages.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-brand-border flex justify-end">
                <button
                  onClick={() => setActiveTab('form')}
                  className="px-4 py-2 border border-brand-border hover:border-brand-primary text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors bg-brand-bg text-brand-primary"
                >
                  Return to Form
                </button>
              </div>
            </div>
          )}

          {/* Tab 3: Terms of Service */}
          {activeTab === 'terms' && (
            <div className="space-y-6 text-sm text-brand-secondary leading-relaxed font-sans">
              <div className="flex items-center gap-2 pb-2 border-b border-brand-border">
                <FileText className="text-brand-primary" size={20} />
                <h3 className="text-lg font-serif text-brand-primary">SMS Terms & Conditions</h3>
              </div>

              <div className="space-y-4 text-xs">
                <p>
                  Please review the terms of WOVN's text messaging program below:
                </p>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">Program Details</h4>
                  <p>
                    By opting in to WOVN SMS alerts, you agree to receive automated notifications, status updates, invoice links, design proof checks, and order reminders. Message frequency varies based on your active orders.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">Opting Out (Unsubscribing)</h4>
                  <p>
                    You can unsubscribe from the text messaging program at any time. Simply text <strong>STOP</strong> to our phone number. After you send STOP, we will send you a final text confirmation confirming you have been unsubscribed. No further messages will be sent unless you opt-in again.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">Customer Support (HELP)</h4>
                  <p>
                    If you experience issues, text <strong>HELP</strong> to our phone number for assistance, or contact our support team at support@wovn.com.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-brand-primary uppercase tracking-wider text-[10px] mb-1">Rates & Disclaimers</h4>
                  <p>
                    Standard message and data rates may apply. Carriers (such as AT&T, T-Mobile, Verizon, etc.) are not liable for delayed or undelivered messages.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-brand-border flex justify-end">
                <button
                  onClick={() => setActiveTab('form')}
                  className="px-4 py-2 border border-brand-border hover:border-brand-primary text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors bg-brand-bg text-brand-primary"
                >
                  Return to Form
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <p className="text-[10px] text-center text-brand-secondary/60">
          WOVN • 2300 West End Ave, Nashville, TN 37203
        </p>

      </div>
    </div>
  );
}
